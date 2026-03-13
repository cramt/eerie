/// AI chat module — spawns the TypeScript agent subprocess.
///
/// Similar to how Zed spawns claude-agent-acp: the daemon forks a Node.js
/// process (`src/agent/index.ts` via tsx) that uses @anthropic-ai/claude-agent-sdk
/// with custom in-process MCP tools, writes the request JSON to its stdin, and
/// reads the response JSON from its stdout.
///
/// Falls back to a helpful error if node/tsx/claude isn't available.
use eerie_rpc::{AiChatRequest, AiChatResponse};
use facet_json::RawJson;
use tokio::io::AsyncWriteExt;

// ── Request/response types for the agent subprocess ───────────────────────

/// What we send to the agent script via stdin.
#[derive(facet::Facet)]
struct AgentRequest {
    messages: Vec<AgentMessage>,
    circuit_yaml: String,
    spice_netlist: String,
    mcp_url: String,
}

#[derive(facet::Facet)]
struct AgentMessage {
    role: String,
    content: String,
}

/// What the agent script writes to stdout.
#[derive(facet::Facet)]
struct AgentResponse {
    message: String,
    mutations: RawJson<'static>,
}

// ── Agent script location ─────────────────────────────────────────────────

/// Find tsx and the agent script, respecting EERIE_WORKSPACE env var.
fn find_agent() -> Option<(String, std::path::PathBuf)> {
    // Workspace root: explicit env var, or current working directory.
    let workspace = std::env::var("EERIE_WORKSPACE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());

    let script = workspace.join("src/agent/index.ts");
    if !script.exists() {
        log::warn!("agent script not found at {}", script.display());
        return None;
    }

    // tsx binary in workspace node_modules
    let tsx = workspace.join("node_modules/.bin/tsx");
    if tsx.exists() {
        return Some((tsx.to_string_lossy().into_owned(), script));
    }

    // Fallback: tsx on PATH
    if which_tsx() {
        return Some(("tsx".into(), script));
    }

    log::warn!("tsx not found — run `pnpm install` in the workspace");
    None
}

fn which_tsx() -> bool {
    std::process::Command::new("tsx")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// ── Main entry point ──────────────────────────────────────────────────────

pub async fn run_chat(api_key: &str, request: AiChatRequest, mcp_url: &str) -> Result<AiChatResponse, String> {
    let Some((tsx_bin, script_path)) = find_agent() else {
        return Err(
            "AI agent not available: tsx binary or src/agent/index.ts not found.\n\
             Run `pnpm install` in the eerie workspace directory, and ensure the\n\
             claude CLI is installed (https://claude.ai/code).".into()
        );
    };

    // Build the request JSON for the agent subprocess.
    let agent_req = AgentRequest {
        messages: request
            .messages
            .into_iter()
            .map(|m| AgentMessage { role: m.role, content: m.content })
            .collect(),
        circuit_yaml: request.circuit_yaml,
        spice_netlist: request.spice_netlist,
        mcp_url: mcp_url.to_owned(),
    };

    let req_json = facet_json::to_string(&agent_req)
        .map_err(|e| format!("Failed to serialize agent request: {e}"))?;

    // Spawn the agent subprocess.
    let mut child = tokio::process::Command::new(&tsx_bin)
        .arg(&script_path)
        .env("ANTHROPIC_API_KEY", api_key)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit()) // let stderr flow through for debugging
        .spawn()
        .map_err(|e| format!("Failed to spawn agent ({}): {e}", tsx_bin))?;

    // Write request JSON to stdin, then close it.
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(req_json.as_bytes()).await
            .map_err(|e| format!("Failed to write to agent stdin: {e}"))?;
    }

    // Wait for the process and collect stdout.
    let output = child.wait_with_output().await
        .map_err(|e| format!("Agent process error: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Agent exited with status {}: {}",
            output.status,
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();

    if stdout.is_empty() {
        return Err("Agent produced no output".into());
    }

    // Parse the response JSON.
    let agent_resp = facet_json::from_str::<AgentResponse>(stdout)
        .map_err(|e| format!("Failed to parse agent response: {e}\nRaw: {stdout}"))?;

    // The mutations field is raw JSON — parse it as Vec<CircuitMutation>.
    let mutations_json = agent_resp.mutations.as_ref();
    let mutations = facet_json::from_str::<Vec<eerie_rpc::CircuitMutation>>(mutations_json)
        .unwrap_or_default();

    Ok(AiChatResponse {
        message: agent_resp.message,
        mutations,
    })
}
