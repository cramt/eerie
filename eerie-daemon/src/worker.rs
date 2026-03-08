//! ngspice worker process.
//!
//! Reads `EERIE_WORKER_SOCKET` from the environment, connects to that Unix
//! socket, and serves one `NgspiceWorker` roam session.  Exits when the
//! daemon closes the connection.
//!
//! Architecture:
//!
//! ```text
//!   main thread (owns NgSpiceSession, !Send)
//!     └── blocking_recv loop
//!           └── processes NgspiceOp serially
//!
//!   tokio thread (spawned std::thread)
//!     └── roam acceptor  →  WorkerHandler { tx }
//!                                │  (send NgspiceOp over channel)
//!                                ▼
//!                         main thread ─── NgSpiceSession
//! ```

use eerie_rpc::{
    Complex, NgspiceRpcError, SimVector,
    NgspiceWorker, NgspiceWorkerClient, NgspiceWorkerDispatcher,
};
use spice_netlist::Netlist;
use ngspice::NgSpice;
use roam::acceptor;
use roam_stream::LocalLink;
use tokio::sync::{mpsc, oneshot};

// ---------------------------------------------------------------------------
// Operation messages sent from the tokio thread → main thread
// ---------------------------------------------------------------------------

enum NgspiceOp {
    LoadCircuit {
        netlist: Netlist,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Command {
        cmd: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    CurrentPlot {
        reply: oneshot::Sender<Result<String, String>>,
    },
    AllPlots {
        reply: oneshot::Sender<Vec<String>>,
    },
    AllVecs {
        plot: String,
        reply: oneshot::Sender<Vec<String>>,
    },
    VecData {
        vecname: String,
        reply: oneshot::Sender<Result<(String, Vec<f64>, Vec<[f64; 2]>), String>>,
    },
    IsRunning {
        reply: oneshot::Sender<bool>,
    },
}

// ---------------------------------------------------------------------------
// NgspiceWorker handler (runs on the tokio thread, must be Send + Sync)
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct WorkerHandler {
    tx: mpsc::UnboundedSender<NgspiceOp>,
}

impl NgspiceWorker for WorkerHandler {
    async fn load_circuit(&self, netlist: Netlist) -> Result<(), NgspiceRpcError> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::LoadCircuit { netlist, reply: reply_tx });
        reply_rx.await.unwrap_or(Err("worker died".into())).map_err(rpc_err)
    }

    async fn command(&self, cmd: String) -> Result<(), NgspiceRpcError> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::Command { cmd, reply: reply_tx });
        reply_rx.await.unwrap_or(Err("worker died".into())).map_err(rpc_err)
    }

    async fn current_plot(&self) -> Result<String, NgspiceRpcError> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::CurrentPlot { reply: reply_tx });
        reply_rx.await.unwrap_or(Err("worker died".into())).map_err(rpc_err)
    }

    async fn all_plots(&self) -> Vec<String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::AllPlots { reply: reply_tx });
        reply_rx.await.unwrap_or_default()
    }

    async fn all_vecs(&self, plot: String) -> Vec<String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::AllVecs { plot, reply: reply_tx });
        reply_rx.await.unwrap_or_default()
    }

    async fn vec_data(&self, vecname: String) -> Result<SimVector, NgspiceRpcError> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::VecData { vecname, reply: reply_tx });
        let result = reply_rx.await.unwrap_or(Err("worker died".into())).map_err(rpc_err)?;
        let (name, real, complex_raw) = result;
        let complex = complex_raw.into_iter().map(|[re, im]| Complex { re, im }).collect();
        Ok(SimVector { name, real, complex })
    }

    async fn is_running(&self) -> bool {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(NgspiceOp::IsRunning { reply: reply_tx });
        reply_rx.await.unwrap_or(false)
    }
}

fn rpc_err(message: String) -> NgspiceRpcError {
    NgspiceRpcError { message }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn main() {
    let socket_path = std::env::var("EERIE_WORKER_SOCKET")
        .expect("EERIE_WORKER_SOCKET must be set");

    let ng = NgSpice::init(
        |msg| eprintln!("[worker] {msg}"),
        |_| {},
    )
    .expect("NgSpice::init failed in worker");

    let mut session = ng.into_session();
    let (tx, mut rx) = mpsc::unbounded_channel::<NgspiceOp>();

    // Spawn the tokio + roam thread.
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime in worker");

        rt.block_on(async move {
            let link = match LocalLink::connect(&socket_path).await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[worker] connect to {socket_path}: {e}");
                    return;
                }
            };

            let (done_tx, done_rx) = oneshot::channel::<()>();
            let dispatcher = NgspiceWorkerDispatcher::new(WorkerHandler { tx });

            let establish = acceptor(link)
                .spawn_fn(move |session_fut| {
                    tokio::spawn(async move {
                        session_fut.await;
                        let _ = done_tx.send(());
                    });
                })
                .establish::<NgspiceWorkerClient>(dispatcher)
                .await;

            match establish {
                Ok((_caller, _session_handle)) => {
                    let _ = done_rx.await;
                }
                Err(e) => eprintln!("[worker] roam establish error: {e:?}"),
            }
        });
    });

    // NgSpiceSession runs on the main thread — processes ops until channel closes.
    while let Some(op) = rx.blocking_recv() {
        match op {
            NgspiceOp::LoadCircuit { netlist, reply } => {
                let lines = netlist.to_lines();
                let result = session
                    .load_circuit(lines.iter().map(String::as_str))
                    .map_err(|e| e.to_string());
                let _ = reply.send(result);
            }
            NgspiceOp::Command { cmd, reply } => {
                let result = session.command(&cmd).map_err(|e| e.to_string());
                let _ = reply.send(result);
            }
            NgspiceOp::CurrentPlot { reply } => {
                let result = session.current_plot().map_err(|e| e.to_string());
                let _ = reply.send(result);
            }
            NgspiceOp::AllPlots { reply } => {
                let _ = reply.send(session.all_plots());
            }
            NgspiceOp::AllVecs { plot, reply } => {
                let vecs = session.all_vecs(&plot).unwrap_or_default();
                let _ = reply.send(vecs);
            }
            NgspiceOp::VecData { vecname, reply } => {
                let result = session.vec_data(&vecname).map(|v| {
                    (v.name, v.real.unwrap_or_default(), v.complex.unwrap_or_default())
                }).map_err(|e| e.to_string());
                let _ = reply.send(result);
            }
            NgspiceOp::IsRunning { reply } => {
                let _ = reply.send(session.is_running());
            }
        }
    }
}
