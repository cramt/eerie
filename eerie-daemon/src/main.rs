mod service;

use std::net::SocketAddr;

use axum::{
    Router,
    extract::WebSocketUpgrade,
    response::IntoResponse,
    routing::get,
};
use roam::DriverCaller;
use tower_http::services::ServeDir;

use crate::service::DaemonService;
use eerie_rpc::EerieServiceDispatcher;

#[tokio::main]
async fn main() {
    env_logger::init();

    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let static_dir = std::env::args().nth(2);

    let mut app = Router::new().route("/rpc", get(ws_handler));

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

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_ws)
}

async fn handle_ws(ws: axum::extract::ws::WebSocket) {
    // Bridge axum's WebSocket to roam via the message-level adapter
    let link = AxumWsLink { ws };
    let dispatcher = EerieServiceDispatcher::new(DaemonService);

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
        let permit = self.tx.clone().reserve_owned().await.map_err(|_| {
            io::Error::new(io::ErrorKind::ConnectionReset, "ws writer stopped")
        })?;
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
