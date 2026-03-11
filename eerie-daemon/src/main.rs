mod service;

use std::net::SocketAddr;

use axum::{
    Router,
    body::Body,
    extract::WebSocketUpgrade,
    http::{Response, StatusCode, Uri, header},
    response::IntoResponse,
    routing::get,
};
use roam::DriverCaller;
use tower_http::services::ServeDir;

use crate::service::DaemonService;
use eerie_rpc::EerieServiceDispatcher;

#[derive(rust_embed::RustEmbed)]
#[folder = "../dist/"]
struct Assets;

async fn embedded_handler(path: &str) -> Response<Body> {
    let path = path.strip_prefix('/').unwrap_or(path);
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(&path) {
        Some(content) => {
            let body = Body::from(content.data.into_owned());
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(body)
                .unwrap()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let static_dir = std::env::args().nth(2);

    // Determine the project directory (cwd) and ensure eerie.yaml exists.
    let project_dir = std::env::current_dir().expect("cannot determine cwd");
    ensure_project_manifest(&project_dir);

    PROJECT_DIR
        .set(project_dir)
        .expect("PROJECT_DIR already set");

    let mut app = Router::new()
        .route("/rpc", get(ws_handler))
        .fallback(get(
            |x: Uri| async move { embedded_handler(x.path()).await },
        ));

    if let Some(dir) = static_dir {
        app = app.fallback_service(ServeDir::new(dir));
    }

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    let local_addr = listener.local_addr().unwrap();

    // Print port for the vite plugin to read
    println!("PORT {}", local_addr.port());

    log::info!("eerie-daemon listening on {}", local_addr);

    axum::serve(listener, app).await.unwrap();
}

/// Creates `eerie.yaml` in `dir` if it does not already exist.
fn ensure_project_manifest(dir: &std::path::Path) {
    let manifest = dir.join("eerie.yaml");
    if manifest.exists() {
        return;
    }
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "My Project".to_string());
    let content = format!("name: {name}\ndescription: \"\"\nversion: \"0.1\"\nlicense: MIT\n");
    if let Err(e) = std::fs::write(&manifest, content) {
        log::warn!("could not create eerie.yaml: {e}");
    } else {
        log::info!("created {}", manifest.display());
    }
}

static PROJECT_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_ws)
}

async fn handle_ws(ws: axum::extract::ws::WebSocket) {
    // Bridge axum's WebSocket to roam via the message-level adapter
    let link = AxumWsLink { ws };
    let project_dir = PROJECT_DIR.get().cloned().unwrap_or_default();
    let dispatcher = EerieServiceDispatcher::new(DaemonService { project_dir });

    let result = roam::acceptor(link)
        .establish::<DriverCaller>(dispatcher)
        .await;

    match result {
        Ok((_guard, _handle)) => {
            std::future::pending::<()>().await;
        }
        Err(e) => {
            log::error!("roam session error: {e:?}");
        }
    }
}

// ── Bridge axum::WebSocket → roam Link ────────────────────────────────────

use roam::{Backing, Link, LinkRx, LinkTx, LinkTxPermit, WriteSlot};
use std::io;
use tokio::sync::mpsc;

struct AxumWsLink {
    ws: axum::extract::ws::WebSocket,
}

impl Link for AxumWsLink {
    type Tx = AxumWsTx;
    type Rx = AxumWsRx;

    fn split(self) -> (Self::Tx, Self::Rx) {
        let (tx_send, tx_recv) = mpsc::channel::<Vec<u8>>(1);
        let (rx_send, rx_recv) = mpsc::channel::<Result<Vec<u8>, io::Error>>(1);

        // Single task that owns the WebSocket and multiplexes read/write
        tokio::spawn(async move {
            let mut ws = self.ws;
            let mut tx_recv = tx_recv;
            loop {
                tokio::select! {
                    // Outbound
                    msg = tx_recv.recv() => {
                        match msg {
                            Some(data) => {
                                if ws.send(axum::extract::ws::Message::Binary(data.into())).await.is_err() {
                                    break;
                                }
                            }
                            None => break,
                        }
                    }
                    // Inbound
                    msg = ws.recv() => {
                        match msg {
                            Some(Ok(axum::extract::ws::Message::Binary(data))) => {
                                if rx_send.send(Ok(data.to_vec())).await.is_err() {
                                    break;
                                }
                            }
                            Some(Ok(axum::extract::ws::Message::Close(_))) | Some(Err(_)) | None => break,
                            _ => continue,
                        }
                    }
                }
            }
        });

        (AxumWsTx { tx: tx_send }, AxumWsRx { rx: rx_recv })
    }
}

struct AxumWsTx {
    tx: mpsc::Sender<Vec<u8>>,
}

struct AxumWsTxPermit {
    permit: mpsc::OwnedPermit<Vec<u8>>,
}

struct AxumWsWriteSlot {
    buf: Vec<u8>,
    permit: mpsc::OwnedPermit<Vec<u8>>,
}

impl LinkTx for AxumWsTx {
    type Permit = AxumWsTxPermit;

    async fn reserve(&self) -> io::Result<Self::Permit> {
        let permit = self
            .tx
            .clone()
            .reserve_owned()
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::ConnectionReset, "ws writer stopped"))?;
        Ok(AxumWsTxPermit { permit })
    }

    async fn close(self) -> io::Result<()> {
        drop(self.tx);
        Ok(())
    }
}

impl LinkTxPermit for AxumWsTxPermit {
    type Slot = AxumWsWriteSlot;

    fn alloc(self, len: usize) -> io::Result<Self::Slot> {
        Ok(AxumWsWriteSlot {
            buf: vec![0u8; len],
            permit: self.permit,
        })
    }
}

impl WriteSlot for AxumWsWriteSlot {
    fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.buf
    }

    fn commit(self) {
        drop(self.permit.send(self.buf));
    }
}

struct AxumWsRx {
    rx: mpsc::Receiver<Result<Vec<u8>, io::Error>>,
}

#[derive(Debug)]
struct AxumWsRxError(io::Error);

impl std::fmt::Display for AxumWsRxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ws rx: {}", self.0)
    }
}

impl std::error::Error for AxumWsRxError {}

impl LinkRx for AxumWsRx {
    type Error = AxumWsRxError;

    async fn recv(&mut self) -> Result<Option<Backing>, Self::Error> {
        match self.rx.recv().await {
            Some(Ok(data)) => Ok(Some(Backing::Boxed(data.into_boxed_slice()))),
            Some(Err(e)) => Err(AxumWsRxError(e)),
            None => Ok(None),
        }
    }
}
