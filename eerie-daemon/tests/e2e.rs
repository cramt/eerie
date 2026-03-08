//! End-to-end tests for eerie-daemon.
//!
//! Spins up the actual daemon binary (zygote + worker pool + TCP listener)
//! and exercises the `EerieDaemon` RPC service.  Multiple circuits run
//! concurrently to verify pool isolation.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use eerie_rpc::{EerieDaemonClient, SimResult};
use roam::initiator;
use roam_stream::StreamLink;
use spice_netlist::Netlist;
use tokio::net::TcpStream;

// ---------------------------------------------------------------------------
// Daemon harness
// ---------------------------------------------------------------------------

struct Daemon {
    child: std::process::Child,
    port: u16,
}

impl Daemon {
    fn spawn() -> Self {
        let bin = env!("CARGO_BIN_EXE_eerie-daemon");

        let mut child = Command::new(bin)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("failed to spawn eerie-daemon");

        // Block until the daemon prints "PORT <n>".
        let stdout = child.stdout.take().expect("piped stdout");
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).expect("read PORT line");

        let port: u16 = line
            .trim()
            .strip_prefix("PORT ")
            .unwrap_or_else(|| panic!("expected 'PORT <n>', got: {line:?}"))
            .parse()
            .expect("port is a number");

        Daemon { child, port }
    }

    async fn connect(&self) -> (EerieDaemonClient, roam::SessionHandle) {
        let stream = TcpStream::connect(("127.0.0.1", self.port))
            .await
            .expect("TCP connect to daemon");

        initiator(StreamLink::tcp(stream))
            .establish::<EerieDaemonClient>(())
            .await
            .expect("roam handshake")
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

// ---------------------------------------------------------------------------
// Test netlists
// ---------------------------------------------------------------------------

/// Equal-value voltage divider: V(out) = supply_v / 2.
fn voltage_divider(supply_v: f64) -> Netlist {
    let src = format!(
        "voltage divider {supply_v}V\n\
         V1 in 0 {supply_v}\n\
         R1 in out 1k\n\
         R2 out 0 1k\n\
         .op\n\
         .end"
    );
    Netlist::parse(&src).expect("parse voltage_divider netlist")
}

/// 3:1 resistor divider: V(out) = supply_v / 4 (R1=3k, R2=1k).
fn divider_3to1(supply_v: f64) -> Netlist {
    let src = format!(
        "3:1 divider {supply_v}V\n\
         V1 in 0 {supply_v}\n\
         R1 in out 3k\n\
         R2 out 0 1k\n\
         .op\n\
         .end"
    );
    Netlist::parse(&src).expect("parse divider_3to1 netlist")
}

// ---------------------------------------------------------------------------
// Helper: extract a real scalar from a named vector in a sim response
// ---------------------------------------------------------------------------

/// Find a scalar value in the simulation response by node name.
///
/// Accepts both `"out"` and `"v(out)"` notation, and matches against
/// bare or plot-qualified vector names (e.g. `"op1.out"`).
fn find_scalar(
    resp: &SimResult,
    query: &str,
) -> Option<f64> {
    // Strip v() wrapper: "v(out)" → "out"
    let node = query
        .strip_prefix("v(")
        .and_then(|s| s.strip_suffix(')'))
        .unwrap_or(query);

    for plot in &resp.plots {
        for v in &plot.vecs {
            if v.name == node
                || v.name == query
                || v.name.ends_with(&format!(".{node}"))
                || v.name.ends_with(&format!(".{query}"))
            {
                return v.real.first().copied();
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Basic connectivity: daemon responds to ping.
#[tokio::test]
async fn ping() {
    let daemon = Daemon::spawn();
    let (client, _session) = daemon.connect().await;

    let pong = client.ping().await.expect("ping RPC failed");
    assert_eq!(pong, "pong");
}

/// Single simulation: voltage divider produces correct V(out).
#[tokio::test]
async fn single_simulation() {
    let daemon = Daemon::spawn();
    let (client, _session) = daemon.connect().await;

    let resp = client.simulate(voltage_divider(5.0)).await.expect("simulate");

    let vout = find_scalar(&resp, "v(out)")
        .unwrap_or_else(|| {
            let names: Vec<_> = resp.plots.iter()
                .flat_map(|p| p.vecs.iter().map(|v| format!("{}.{}", p.name, v.name)))
                .collect();
            panic!("v(out) not found; available: {names:?}");
        });

    assert!(
        (vout - 2.5).abs() < 0.01,
        "expected V(out) ≈ 2.5V for 5V divider, got {vout}V"
    );
}

/// Sequential simulations through one connection.
///
/// Each call gets a fresh worker from the pool (or a reused one after the
/// 30 s timeout).  Results must not bleed between runs.
#[tokio::test]
async fn sequential_simulations() {
    let daemon = Daemon::spawn();
    let (client, _session) = daemon.connect().await;

    let cases: &[(f64, f64)] = &[
        (2.0, 1.0),
        (6.0, 3.0),
        (10.0, 5.0),
        (4.0, 2.0), // out-of-order to catch result cross-contamination
    ];

    for &(supply, expected) in cases {
        let resp = client
            .simulate(voltage_divider(supply))
            .await
            .unwrap_or_else(|e| panic!("simulate({supply}V): {e:?}"));

        let vout = find_scalar(&resp, "v(out)")
            .unwrap_or_else(|| panic!("no v(out) for {supply}V circuit"));

        assert!(
            (vout - expected).abs() < 0.01,
            "{supply}V circuit: expected V(out) ≈ {expected}V, got {vout}V"
        );
    }
}

/// Concurrent simulations: 6 circuits run at the same time using independent
/// connections.  Each worker must see only its own circuit state.
#[tokio::test]
async fn concurrent_simulations_are_isolated() {
    let daemon = Daemon::spawn();

    // (netlist, expected V(out))
    let cases: Vec<(Netlist, f64)> = vec![
        (voltage_divider(2.0), 1.0),
        (voltage_divider(4.0), 2.0),
        (voltage_divider(6.0), 3.0),
        (voltage_divider(8.0), 4.0),
        (divider_3to1(8.0), 2.0),   // 8V / 4 = 2V
        (divider_3to1(12.0), 3.0),  // 12V / 4 = 3V
    ];

    let mut set = tokio::task::JoinSet::new();

    for (netlist, expected) in cases {
        let port = daemon.port;
        set.spawn(async move {
            let stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            let (client, _session) = initiator(StreamLink::tcp(stream))
                .establish::<EerieDaemonClient>(())
                .await
                .unwrap();

            let resp = client.simulate(netlist).await.unwrap();
            (expected, resp)
        });
    }

    while let Some(result) = set.join_next().await {
        let (expected, resp) = result.expect("task panicked");

        let vout = find_scalar(&resp, "v(out)")
            .unwrap_or_else(|| {
                let names: Vec<_> = resp.plots.iter()
                    .flat_map(|p| p.vecs.iter().map(|v| format!("{}.{}", p.name, v.name)))
                    .collect();
                panic!("v(out) not found; available: {names:?}");
            });

        assert!(
            (vout - expected).abs() < 0.01,
            "expected V(out) ≈ {expected}V, got {vout}V"
        );
    }
}

/// Pool reuse under sequential load: run more simulations than workers
/// were created for to exercise the idle-reuse path.
#[tokio::test]
async fn pool_reuse() {
    let daemon = Daemon::spawn();
    let (client, _session) = daemon.connect().await;

    // 8 sequential runs — well above a reasonable initial pool size.
    // Workers from earlier runs must be returnable and reusable.
    for i in 0..8u32 {
        let supply = 1.0 + i as f64;
        let expected = supply / 2.0;

        let resp = client
            .simulate(voltage_divider(supply))
            .await
            .unwrap_or_else(|e| panic!("run {i}: sim_dc failed: {e:?}"));

        let vout = find_scalar(&resp, "v(out)")
            .unwrap_or_else(|| panic!("run {i}: no v(out)"));

        assert!(
            (vout - expected).abs() < 0.01,
            "run {i} ({supply}V): expected V(out) ≈ {expected}V, got {vout}V"
        );
    }
}
