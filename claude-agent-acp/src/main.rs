use std::io::{self, BufRead, Write};

use bytes::Bytes;
use claude_agent_acp::{first_host_pipe, stream_extension, HostPipe};
use deno_bundle::bundle;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::oneshot;

// ── Protocol types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct PromptRequest<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    messages: &'a [Message],
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AgentEvent {
    Delta { text: String },
    Done { stop_reason: String, usage: Value },
    Error { message: String },
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Install default TLS crypto provider (aws_lc_rs) so deno_tls can make HTTPS calls.
    rustls::crypto::aws_lc_rs::default_provider().install_default().ok();

    // Bundle index.ts at compile time via esbuild proc-macro.
    let js = bundle!("src/index.ts");

    // A oneshot channel to deliver the HostPipe from the Deno setup closure
    // to the conversation task that runs concurrently with the event loop.
    let (pipe_tx, pipe_rx) = oneshot::channel::<HostPipe>();

    let local = tokio::task::LocalSet::new();

    local
        .run_until(async move {
            // Spawn the conversation as a background local task.
            // It waits for the pipe, then interacts with the user.
            tokio::task::spawn_local(async move {
                let pipe = pipe_rx.await.expect("setup did not send pipe");
                conversation_loop(pipe).await;
            });

            // Drive the Deno event loop.  The setup closure runs synchronously
            // right after execute_script (at which point JS has already called
            // op_pipe_open), so we can extract the HostPipe here.
            js.run_with_setup(vec![stream_extension()], move |worker| {
                let op_state = worker.js_runtime.op_state();
                let state = op_state.borrow();
                let pipe =
                    first_host_pipe(&state).expect("JS did not call op_pipe_open");
                let _ = pipe_tx.send(pipe);
            })
            .await;
        })
        .await;
}

// ── Conversation loop ─────────────────────────────────────────────────────────

async fn conversation_loop(host_pipe: HostPipe) {
    let mut history: Vec<Message> = Vec::new();
    let stdin = io::stdin();

    loop {
        print!("\nYou: ");
        io::stdout().flush().unwrap();

        let mut line = String::new();
        {
            let mut reader = stdin.lock();
            if reader.read_line(&mut line).unwrap() == 0 {
                break; // EOF
            }
        }
        let user_text = line.trim().to_string();
        if user_text.is_empty() {
            continue;
        }

        history.push(Message { role: "user".into(), content: user_text });

        // Serialize the full message history as a single JSON line.
        let request = PromptRequest { kind: "prompt", messages: &history, system: None };
        let json_line = serde_json::to_string(&request).unwrap() + "\n";
        if host_pipe
            .to_js
            .send(Bytes::from(json_line.into_bytes()))
            .await
            .is_err()
        {
            eprintln!("[pipe closed — JS exited]");
            break;
        }

        // Stream response events from JS.
        print!("\nClaude: ");
        io::stdout().flush().unwrap();

        let mut assistant_text = String::new();
        loop {
            let chunk = {
                let mut rx = host_pipe.from_js.lock().await;
                rx.recv().await
            };
            let chunk = match chunk {
                Some(c) => c,
                None => {
                    eprintln!("\n[JS pipe closed]");
                    return;
                }
            };

            let raw = String::from_utf8_lossy(&chunk);
            let event: AgentEvent = match serde_json::from_str(raw.trim()) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("\n[parse error: {e}] raw: {raw}");
                    continue;
                }
            };

            match event {
                AgentEvent::Delta { text } => {
                    print!("{text}");
                    io::stdout().flush().unwrap();
                    assistant_text.push_str(&text);
                }
                AgentEvent::Done { stop_reason, usage } => {
                    println!();
                    eprintln!(
                        "[stop={stop_reason} in={} out={}]",
                        usage["input_tokens"], usage["output_tokens"]
                    );
                    break;
                }
                AgentEvent::Error { message } => {
                    eprintln!("\n[error] {message}");
                    break;
                }
            }
        }

        if !assistant_text.is_empty() {
            history.push(Message { role: "assistant".into(), content: assistant_text });
        }
    }
    // Dropping host_pipe.to_js closes the channel → JS while(true) loop sees
    // null from op_pipe_read and exits cleanly.
}
