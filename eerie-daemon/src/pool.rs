//! Ngspice process pool.
//!
//! Workers are plain subprocesses of the daemon binary
//! (re-invoked with `EERIE_WORKER_SOCKET=<path>`).  Each worker
//! initialises ngspice from scratch and exposes a full `NgspiceWorker`
//! roam session over a Unix socket.
//!
//! ## Lifecycle
//!
//! ```text
//!   WorkerPool::spawn()  →  creates idle queue + reaper task (no subprocesses yet)
//!
//!   pool.circuit().await
//!     ├── idle worker available  →  pop from idle queue
//!     └── no idle workers       →  spawn new subprocess
//!
//!   CircuitHandle (returned to caller)
//!     └── on Drop  →  send back through return channel → idle queue
//!
//!   reaper_task (background)
//!     └── every 5 s: evict workers idle > IDLE_TIMEOUT
//!           └── drop SessionHandle  →  roam session closes  →  worker exits
//! ```

use std::collections::VecDeque;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

use eerie_rpc::{NgspicePlot, NgspiceSimResponse, NgspiceVec, NgspiceWorkerClient};
use log::{error, info};
use roam::initiator;
use roam_stream::LocalLinkAcceptor;
use tokio::process::Command;
use tokio::sync::{Mutex, mpsc};

const IDLE_TIMEOUT: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

struct IdleWorker {
    client: NgspiceWorkerClient,
    session: roam::SessionHandle,
    idle_since: Instant,
}

struct ReturnedWorker {
    client: NgspiceWorkerClient,
    session: roam::SessionHandle,
}

// ---------------------------------------------------------------------------
// WorkerPool
// ---------------------------------------------------------------------------

pub struct WorkerPool {
    return_tx: mpsc::UnboundedSender<ReturnedWorker>,
    idle: Arc<Mutex<VecDeque<IdleWorker>>>,
}

impl WorkerPool {
    /// Create a pool.  No subprocesses are started until the first
    /// [`WorkerPool::circuit`] call.
    pub async fn spawn() -> Result<Arc<Self>, String> {
        let idle = Arc::new(Mutex::new(VecDeque::<IdleWorker>::new()));
        let (return_tx, return_rx) = mpsc::unbounded_channel();

        let pool = Arc::new(WorkerPool { return_tx, idle: idle.clone() });

        tokio::spawn(reaper_task(return_rx, idle));

        Ok(pool)
    }

    /// Acquire a `CircuitHandle` backed by a worker process.
    ///
    /// Reuses an idle worker if one is available, otherwise spawns a new one.
    /// Dropping the handle returns the worker to the idle queue.
    pub async fn circuit(self: &Arc<Self>) -> Result<CircuitHandle, String> {
        // Try to reuse an idle worker.
        {
            let mut idle = self.idle.lock().await;
            if let Some(w) = idle.pop_front() {
                return Ok(CircuitHandle {
                    client: Some(w.client),
                    session: Some(w.session),
                    return_tx: self.return_tx.clone(),
                });
            }
        }

        // No idle workers — spawn a new subprocess.
        let (client, session) = self.spawn_worker().await?;
        Ok(CircuitHandle {
            client: Some(client),
            session: Some(session),
            return_tx: self.return_tx.clone(),
        })
    }

    async fn spawn_worker(&self) -> Result<(NgspiceWorkerClient, roam::SessionHandle), String> {
        let job_id = uuid::Uuid::new_v4();
        let socket_path = format!("/tmp/eerie-{job_id}.sock");

        // Bind before spawning so the worker's connect() never races accept().
        let acceptor = LocalLinkAcceptor::bind(&socket_path)
            .map_err(|e| format!("bind {socket_path}: {e}"))?;

        let worker_exe = std::env::current_exe()
            .map_err(|e| format!("current_exe: {e}"))?
            .with_file_name("eerie-worker");

        let mut child = Command::new(&worker_exe)
            .env("EERIE_WORKER_SOCKET", &socket_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("spawn worker: {e}"))?;

        // Reap the child so it doesn't become a zombie.
        tokio::spawn(async move {
            let _ = child.wait().await;
        });

        let link =
            tokio::time::timeout(Duration::from_secs(30), acceptor.accept())
                .await
                .map_err(|_| "timeout waiting for worker to connect".to_string())?
                .map_err(|e| format!("accept worker: {e}"))?;

        let _ = std::fs::remove_file(&socket_path);

        let (client, session): (NgspiceWorkerClient, _) = initiator(link)
            .establish::<NgspiceWorkerClient>(())
            .await
            .map_err(|e| format!("roam initiator establish: {e:?}"))?;

        Ok((client, session))
    }
}

// ---------------------------------------------------------------------------
// Background reaper
// ---------------------------------------------------------------------------

async fn reaper_task(
    mut return_rx: mpsc::UnboundedReceiver<ReturnedWorker>,
    idle: Arc<Mutex<VecDeque<IdleWorker>>>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    interval.tick().await; // skip immediate first tick

    loop {
        tokio::select! {
            returned = return_rx.recv() => {
                let Some(w) = returned else { break };
                idle.lock().await.push_back(IdleWorker {
                    client: w.client,
                    session: w.session,
                    idle_since: Instant::now(),
                });
            }
            _ = interval.tick() => {
                let stale = {
                    let mut guard = idle.lock().await;
                    let now = Instant::now();
                    let (fresh, stale): (Vec<_>, Vec<_>) = guard
                        .drain(..)
                        .partition(|w| now.duration_since(w.idle_since) < IDLE_TIMEOUT);
                    *guard = fresh.into_iter().collect();
                    stale
                };
                if !stale.is_empty() {
                    info!("reaper: evicting {} idle worker(s)", stale.len());
                }
                drop(stale);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// CircuitHandle — caller-facing handle to one ngspice worker session
// ---------------------------------------------------------------------------

/// A live handle to a worker process running an ngspice session.
///
/// Dropping this handle returns the worker to the pool's idle queue.
/// It will be evicted (process killed) after [`IDLE_TIMEOUT`] of inactivity.
pub struct CircuitHandle {
    client: Option<NgspiceWorkerClient>,
    session: Option<roam::SessionHandle>,
    return_tx: mpsc::UnboundedSender<ReturnedWorker>,
}

impl Drop for CircuitHandle {
    fn drop(&mut self) {
        if let (Some(client), Some(session)) = (self.client.take(), self.session.take()) {
            let _ = self.return_tx.send(ReturnedWorker { client, session });
        }
    }
}

impl CircuitHandle {
    fn client(&self) -> &NgspiceWorkerClient {
        self.client.as_ref().expect("client taken")
    }

    /// Load a SPICE netlist into the worker, replacing any prior circuit.
    pub async fn load_circuit(&self, netlist: Vec<String>) -> Result<(), String> {
        self.client().load_circuit(netlist).await.map_err(|e| format!("{e:?}"))
    }

    /// Send any ngspice interactive command (e.g. `"run"`, `"op"`, `"dc v1 0 5 0.01"`).
    pub async fn command(&self, cmd: String) -> Result<(), String> {
        self.client().command(cmd).await.map_err(|e| format!("{e:?}"))
    }

    /// Name of the current active plot (e.g. `"op1"`, `"tran2"`).
    pub async fn current_plot(&self) -> Result<String, String> {
        self.client().current_plot().await.map_err(|e| format!("{e:?}"))
    }

    /// Names of all plots produced so far in this session.
    pub async fn all_plots(&self) -> Vec<String> {
        self.client().all_plots().await.unwrap_or_default()
    }

    /// Names of all vectors in `plot`.
    pub async fn all_vecs(&self, plot: String) -> Vec<String> {
        self.client().all_vecs(plot).await.unwrap_or_default()
    }

    /// Fetch a simulation vector by name (bare or plot-qualified).
    pub async fn vec_data(&self, vecname: String) -> Result<NgspiceVec, String> {
        self.client().vec_data(vecname).await.map_err(|e| format!("{e:?}"))
    }

    /// `true` if a simulation is currently running in the background.
    pub async fn is_running(&self) -> bool {
        self.client().is_running().await.unwrap_or(false)
    }

    /// Convenience: load a netlist, run it, and collect all result vectors.
    pub async fn simulate(&self, netlist: Vec<String>) -> Result<NgspiceSimResponse, String> {
        self.load_circuit(netlist).await?;
        self.command("run".to_string()).await?;

        let plot_names = self.all_plots().await;
        let mut plots = Vec::new();

        for plot_name in &plot_names {
            if plot_name == "const" {
                continue;
            }
            let vec_names = self.all_vecs(plot_name.clone()).await;
            let mut vecs = Vec::with_capacity(vec_names.len());

            for vec_name in &vec_names {
                let qualified = format!("{plot_name}.{vec_name}");
                match self.vec_data(qualified).await {
                    Ok(v) => vecs.push(v),
                    Err(e) => error!("vec_data {vec_name}: {e}"),
                }
            }

            plots.push(NgspicePlot { name: plot_name.clone(), vecs });
        }

        Ok(NgspiceSimResponse { plots })
    }
}
