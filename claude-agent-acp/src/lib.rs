use std::{cell::RefCell, collections::HashMap, rc::Rc, sync::Arc};
use bytes::Bytes;
use deno_core::{op2, Extension, ExtensionFileSource, JsBuffer, OpDecl, OpState, Resource, ResourceId};
use deno_error::JsErrorBox;
use tokio::sync::{mpsc, Mutex};

const CAP: usize = 64;

/// Host-side view of a pipe: send to JS, receive from JS.
#[derive(Clone)]
pub struct HostPipe {
    pub to_js: mpsc::Sender<Bytes>,
    pub from_js: Arc<Mutex<mpsc::Receiver<Bytes>>>,
}

#[derive(Default)]
struct HostPipes {
    map: HashMap<ResourceId, HostPipe>,
}

/// JS-side resource: receives from host, sends to host.
struct PipeResource {
    to_js_rx: Mutex<mpsc::Receiver<Bytes>>,
    from_js_tx: mpsc::Sender<Bytes>,
}

impl Resource for PipeResource {
    fn name(&self) -> std::borrow::Cow<'_, str> {
        "pipe".into()
    }
}

#[op2(fast)]
#[smi]
fn op_eerie_pipe_open(state: &mut OpState) -> Result<ResourceId, JsErrorBox> {
    let (to_js_tx, to_js_rx) = mpsc::channel::<Bytes>(CAP);
    let (from_js_tx, from_js_rx) = mpsc::channel::<Bytes>(CAP);

    let rid = state.resource_table.add(PipeResource {
        to_js_rx: Mutex::new(to_js_rx),
        from_js_tx,
    });

    state.borrow_mut::<HostPipes>().map.insert(
        rid,
        HostPipe {
            to_js: to_js_tx,
            from_js: Arc::new(Mutex::new(from_js_rx)),
        },
    );

    Ok(rid)
}

#[op2]
#[serde]
async fn op_eerie_pipe_read(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
) -> Result<Option<Vec<u8>>, JsErrorBox> {
    let resource = state
        .borrow_mut()
        .resource_table
        .get::<PipeResource>(rid)
        .map_err(JsErrorBox::from_err)?;
    // state borrow released; resource is Rc<PipeResource>
    match resource.to_js_rx.lock().await.recv().await {
        Some(bytes) => Ok(Some(bytes.to_vec())),
        None => Ok(None),
    }
}

#[op2]
async fn op_eerie_pipe_write(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
    #[buffer] data: JsBuffer,
) -> Result<(), JsErrorBox> {
    let resource = state
        .borrow_mut()
        .resource_table
        .get::<PipeResource>(rid)
        .map_err(JsErrorBox::from_err)?;
    let tx = resource.from_js_tx.clone();
    tx.send(Bytes::copy_from_slice(&data))
        .await
        .map_err(|_| JsErrorBox::generic("pipe closed"))
}

#[op2(fast)]
fn op_eerie_pipe_close(state: &mut OpState, #[smi] rid: ResourceId) -> Result<(), JsErrorBox> {
    let resource = state
        .resource_table
        .take::<PipeResource>(rid)
        .map_err(JsErrorBox::from_err)?;
    resource.close();
    state.borrow_mut::<HostPipes>().map.remove(&rid);
    Ok(())
}

/// Returns the first `HostPipe` registered in `OpState`, if any.
/// Call this after JS has executed `op_eerie_pipe_open()` at least once.
pub fn first_host_pipe(state: &OpState) -> Option<HostPipe> {
    state
        .try_borrow::<HostPipes>()
        .and_then(|pipes| pipes.map.values().next().cloned())
}

pub fn stream_extension() -> Extension {
    const DECLS: &[OpDecl] = &[
        op_eerie_pipe_open(),
        op_eerie_pipe_read(),
        op_eerie_pipe_write(),
        op_eerie_pipe_close(),
    ];
    // Expose ops to user scripts via globalThis.__eerieOps.
    // Extension ESM files run before execute_script, so this global is available
    // to the bundled index.ts even though Deno.core is not accessible there.
    const SETUP_JS: &str = concat!(
        r#"import { op_eerie_pipe_open, op_eerie_pipe_read, op_eerie_pipe_write, op_eerie_pipe_close } from "ext:core/ops";"#,
        "\nglobalThis.__eerieOps = { op_eerie_pipe_open, op_eerie_pipe_read, op_eerie_pipe_write, op_eerie_pipe_close };",
    );
    let esm_files = vec![ExtensionFileSource::new_computed(
        "ext:embedded_pipe/setup.js",
        std::sync::Arc::from(SETUP_JS),
    )];
    Extension {
        name: "embedded_pipe",
        ops: std::borrow::Cow::Borrowed(DECLS),
        esm_files: std::borrow::Cow::Owned(esm_files),
        esm_entry_point: Some("ext:embedded_pipe/setup.js"),
        op_state_fn: Some(Box::new(|state: &mut OpState| {
            state.put(HostPipes::default());
        })),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use deno_core::{JsRuntime, PollEventLoopOptions, RuntimeOptions};

    fn make_runtime() -> JsRuntime {
        JsRuntime::new(RuntimeOptions {
            extensions: vec![stream_extension()],
            ..Default::default()
        })
    }

    /// Returns the first HostPipe from the runtime's OpState.
    /// The JS must have called op_eerie_pipe_open() before this.
    fn take_host_pipe(runtime: &JsRuntime) -> HostPipe {
        let op_state = runtime.op_state();
        let state = op_state.borrow();
        let pipes = state.borrow::<HostPipes>();
        let (_, pipe) = pipes.map.iter().next().expect("no pipe in HostPipes");
        pipe.clone()
    }

    /// Basic roundtrip: Rust sends bytes → JS reads and echoes back → Rust receives.
    #[tokio::test(flavor = "current_thread")]
    async fn test_pipe_roundtrip() {
        let mut runtime = make_runtime();

        // JS opens a pipe, reads one chunk, writes it back with a sentinel byte appended.
        runtime
            .execute_script(
                "<test:roundtrip>",
                r#"
                (async () => {
                    const { op_eerie_pipe_open, op_eerie_pipe_read, op_eerie_pipe_write, op_eerie_pipe_close } =
                        Deno.core.ops;
                    const rid = op_eerie_pipe_open();
                    const data = await op_eerie_pipe_read(rid);
                    const response = new Uint8Array(data.length + 1);
                    response.set(data);
                    response[data.length] = 0xFF; // sentinel
                    await op_eerie_pipe_write(rid, response);
                    op_eerie_pipe_close(rid);
                })();
                "#,
            )
            .unwrap();

        // The pipe was opened synchronously above (op_eerie_pipe_open is fast/sync).
        let host_pipe = take_host_pipe(&runtime);

        // Pre-fill the channel before running the event loop (buffered, won't block).
        host_pipe
            .to_js
            .try_send(Bytes::from_static(b"hello"))
            .unwrap();

        // Drive the event loop: JS reads the pre-sent data and writes back.
        runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await
            .unwrap();

        // JS wrote the echo + sentinel; receive it synchronously (data is in channel).
        let received = host_pipe.from_js.lock().await.try_recv().unwrap();
        assert_eq!(&received[..5], b"hello");
        assert_eq!(received[5], 0xFF);
    }

    /// Pipe close: op_eerie_pipe_read returns null when the Rust sender is dropped.
    /// JS signals this by writing a known marker byte via op_eerie_pipe_write.
    #[tokio::test(flavor = "current_thread")]
    async fn test_pipe_read_returns_null_on_close() {
        let mut runtime = make_runtime();

        runtime
            .execute_script(
                "<test:null_on_close>",
                r#"
                (async () => {
                    const { op_eerie_pipe_open, op_eerie_pipe_read, op_eerie_pipe_write } = Deno.core.ops;
                    const rid = op_eerie_pipe_open();
                    const data = await op_eerie_pipe_read(rid);
                    // Write 0x01 for null, 0x00 for non-null, so Rust can verify.
                    await op_eerie_pipe_write(rid, new Uint8Array([data === null ? 1 : 0]));
                })();
                "#,
            )
            .unwrap();

        // Drop the HostPipe's to_js Sender so JS receives null from op_eerie_pipe_read.
        // The PipeResource holds the receiver; the HostPipe holds the sender.
        // Clearing the map drops the sender, closing the channel.
        let host_pipe = take_host_pipe(&runtime);
        {
            let op_state = runtime.op_state();
            let mut state = op_state.borrow_mut();
            state.borrow_mut::<HostPipes>().map.clear();
        }
        // Drop the local clone too so the channel actually closes.
        drop(host_pipe.to_js);

        runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await
            .unwrap();

        let received = host_pipe.from_js.lock().await.try_recv().unwrap();
        assert_eq!(received.as_ref(), &[1u8], "expected JS to receive null");
    }

    /// Multiple chunks: Rust sends two messages, JS reads both.
    #[tokio::test(flavor = "current_thread")]
    async fn test_pipe_multiple_chunks() {
        let mut runtime = make_runtime();

        runtime
            .execute_script(
                "<test:multi>",
                r#"
                (async () => {
                    const { op_eerie_pipe_open, op_eerie_pipe_read, op_eerie_pipe_write, op_eerie_pipe_close } =
                        Deno.core.ops;
                    const rid = op_eerie_pipe_open();
                    const a = await op_eerie_pipe_read(rid);
                    const b = await op_eerie_pipe_read(rid);
                    // Write lengths as a 2-byte response
                    await op_eerie_pipe_write(rid, new Uint8Array([a.length, b.length]));
                    op_eerie_pipe_close(rid);
                })();
                "#,
            )
            .unwrap();

        let host_pipe = take_host_pipe(&runtime);

        host_pipe.to_js.try_send(Bytes::from_static(b"abc")).unwrap();
        host_pipe.to_js.try_send(Bytes::from_static(b"de")).unwrap();

        runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await
            .unwrap();

        let received = host_pipe.from_js.lock().await.try_recv().unwrap();
        assert_eq!(received.as_ref(), &[3u8, 2u8]); // lengths of "abc" and "de"
    }
}
