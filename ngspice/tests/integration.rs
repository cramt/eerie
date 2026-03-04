//! Integration tests for the `ngspice` safe wrapper.
//!
//! ngspice is a **process-wide singleton**; all tests share one [`NgSpice`]
//! instance via [`SPICE`].  Run with:
//!
//! ```text
//! cargo test -p ngspice -- --test-threads=1
//! ```

use std::sync::{LazyLock, Mutex, MutexGuard};

use ngspice::code_model::*;
use ngspice::{NgSpice, NgSpiceError};

// ---------------------------------------------------------------------------
// Shared singleton
// ---------------------------------------------------------------------------

/// Newtype so we can store `!Send + !Sync` NgSpice in a `static Mutex`.
///
/// # Safety
/// Tests must run with `--test-threads=1`.  The Mutex ensures sequential
/// access; the unsafe impls are sound under that constraint.
struct S(NgSpice);
unsafe impl Send for S {}
unsafe impl Sync for S {}

static SPICE: LazyLock<Mutex<S>> = LazyLock::new(|| {
    let mut ng = NgSpice::init(
        |_| {},                                               // suppress output
        |code| eprintln!("[ngspice] exit request: {code}"),
    )
    .expect("NgSpice::init failed");

    // Register a custom Rust gain code model for XSPICE tests.
    // Uses a closure that captures `output_conn` to prove captures work.
    let output_conn: usize = 1;
    let model = CodeModelBuilder::new("rust_gain", "Rust gain block")
        .conn(ConnSpec::new("in", Direction::In, PortType::Voltage))
        .conn(ConnSpec::new("out", Direction::Out, PortType::Voltage))
        .param(ParamSpec::real("gain", 1.0))
        .build(move |ctx| {
            let gain = ctx.param_real(0);
            let input = ctx.input_real(0, 0);
            ctx.set_output_real(output_conn, 0, gain * input);
            ctx.set_partial(output_conn, 0, 0, 0, gain);
        });
    ng.register_code_model(model)
        .expect("register_code_model failed");

    Mutex::new(S(ng))
});

fn lock() -> MutexGuard<'static, S> {
    SPICE.lock().unwrap()
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn double_init_is_rejected() {
    let _guard = lock(); // ensure SPICE is initialised
    let err = NgSpice::init(|_| {}, |_| {}).unwrap_err();
    assert!(matches!(err, NgSpiceError::AlreadyInitialized));
}

// ---------------------------------------------------------------------------
// DC operating-point (.op)
// ---------------------------------------------------------------------------

/// Voltage divider: V1=5 V, R1=R2=1 kΩ → v(mid) = 2.5 V.
#[test]
fn op_voltage_divider() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "Voltage divider",
        "V1 in 0 dc 5",
        "R1 in mid 1k",
        "R2 mid 0 1k",
        ".op",
        ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let plot = ckt.current_plot().unwrap();
    assert!(plot.starts_with("op"), "unexpected plot: {plot}");

    let v_in  = ckt.vec_data(&format!("{plot}.in")).unwrap();
    let v_mid = ckt.vec_data(&format!("{plot}.mid")).unwrap();
    let i_v1  = ckt.vec_data(&format!("{plot}.v1#branch")).unwrap();

    let val_in  = v_in.real.as_deref().unwrap()[0];
    let val_mid = v_mid.real.as_deref().unwrap()[0];
    let val_i   = i_v1.real.as_deref().unwrap()[0];

    assert!((val_in  - 5.0  ).abs() < 1e-9,  "v(in)={val_in}");
    assert!((val_mid - 2.5  ).abs() < 1e-9,  "v(mid)={val_mid}");
    assert!((val_i   - (-2.5e-3)).abs() < 1e-12, "i(V1)={val_i}");
    // Circuit dropped here → remcirc
}

/// Every name from `all_vecs` must be retrievable via `vec_data`.
#[test]
fn all_vecs_are_queryable() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "Query test",
        "V1 a 0 dc 1",
        "R1 a 0 1k",
        ".op",
        ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let plot = ckt.current_plot().unwrap();
    let vecs = ckt.all_vecs(&plot).unwrap();
    assert!(!vecs.is_empty());

    for name in &vecs {
        let data = ckt.vec_data(&format!("{plot}.{name}")).unwrap();
        let len = data.real.as_ref().map(|v| v.len())
            .or_else(|| data.complex.as_ref().map(|v| v.len()))
            .unwrap_or(0);
        assert!(len > 0, "vector {name} has no data");
    }
}

// ---------------------------------------------------------------------------
// DC sweep (.dc)
// ---------------------------------------------------------------------------

/// V1 swept 0→5 V in 1 V steps: 6 points, v(mid) = k/2 at step k.
#[test]
fn dc_sweep_vector_length_and_linearity() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "DC sweep divider",
        "V1 in 0 dc 0",
        "R1 in mid 1k",
        "R2 mid 0 1k",
        ".dc V1 0 5 1",
        ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let plot = ckt.current_plot().unwrap();
    assert!(plot.starts_with("dc"), "unexpected plot: {plot}");

    let data = ckt.vec_data(&format!("{plot}.mid")).unwrap().real.unwrap();
    assert_eq!(data.len(), 6, "expected 6 sweep points");

    for (k, &val) in data.iter().enumerate() {
        let expected = k as f64 / 2.0;
        assert!((val - expected).abs() < 1e-9, "step {k}: v(mid)={val}, expected {expected}");
    }
}

// ---------------------------------------------------------------------------
// Transient simulation (.tran)
// ---------------------------------------------------------------------------

/// RC step-response: τ = RC = 1 ms, simulate 10 ms.
/// Time must be monotonic; v(out) starts ≈0, reaches >0.99 after 5τ.
#[test]
fn tran_rc_step_response() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "RC step response",
        "V1 in 0 PULSE(0 1 0 1n 1n 10m 20m)",
        "R1 in out 1k",
        "C1 out 0 1u",
        ".tran 0.1m 10m",
        ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let plot = ckt.current_plot().unwrap();
    assert!(plot.starts_with("tran"), "unexpected plot: {plot}");

    let t_data = ckt.vec_data(&format!("{plot}.time")).unwrap().real.unwrap();
    let v_data = ckt.vec_data(&format!("{plot}.out")).unwrap().real.unwrap();

    assert!(t_data.len() > 10, "too few time points: {}", t_data.len());

    // Time is monotonically non-decreasing.
    for w in t_data.windows(2) {
        assert!(w[1] >= w[0], "time not monotonic: {} → {}", w[0], w[1]);
    }

    // v(out) starts close to 0.
    assert!(v_data[0].abs() < 0.01, "v(out) at t=0 = {:.4}", v_data[0]);

    // v(out) at 5τ ≈ 5 ms should be > 99 % of final value.
    let target = 5e-3_f64;
    let idx = t_data.iter().enumerate()
        .min_by(|(_, a), (_, b)| {
            ((*a - target).abs()).partial_cmp(&((*b - target).abs())).unwrap()
        })
        .map(|(i, _)| i)
        .unwrap();
    assert!(v_data[idx] > 0.99, "v(out) at 5τ = {:.4}", v_data[idx]);
}

// ---------------------------------------------------------------------------
// Sequential circuits (RAII queue)
// ---------------------------------------------------------------------------

/// Load two circuits back-to-back; remcirc between them must leave ngspice
/// ready for the second load without error.
#[test]
fn sequential_circuits_via_raii() {
    let mut guard = lock();

    let result_1 = {
        let mut ckt = guard.0.load_circuit([
            "Circuit A",
            "V1 a 0 dc 3",
            "R1 a 0 1k",
            ".op",
            ".end",
        ]).unwrap();
        ckt.run().unwrap();
        let plot = ckt.current_plot().unwrap();
        ckt.vec_data(&format!("{plot}.a")).unwrap().real.unwrap()[0]
    }; // ← remcirc here

    let result_2 = {
        let mut ckt = guard.0.load_circuit([
            "Circuit B",
            "V1 a 0 dc 7",
            "R1 a 0 1k",
            ".op",
            ".end",
        ]).unwrap();
        ckt.run().unwrap();
        let plot = ckt.current_plot().unwrap();
        ckt.vec_data(&format!("{plot}.a")).unwrap().real.unwrap()[0]
    }; // ← remcirc here

    assert!((result_1 - 3.0).abs() < 1e-9, "circuit A: {result_1}");
    assert!((result_2 - 7.0).abs() < 1e-9, "circuit B: {result_2}");
}

// ---------------------------------------------------------------------------
// `all_plots` and `is_running`
// ---------------------------------------------------------------------------

#[test]
fn all_plots_contains_current() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "Plot check", "V1 a 0 dc 1", "R1 a 0 1", ".op", ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let current = ckt.current_plot().unwrap();
    let all = ckt.all_plots().unwrap();
    assert!(all.contains(&current), "{current:?} not in {all:?}");
}

#[test]
fn is_not_running_after_sync_run() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "Running check", "V1 a 0 dc 1", "R1 a 0 1k", ".op", ".end",
    ]).unwrap();
    ckt.run().unwrap();
    assert!(!ckt.is_running());
}

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

#[test]
fn vec_not_found_error() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "Error test", "V1 a 0 dc 1", "R1 a 0 1k", ".op", ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let err = ckt.vec_data("no_such_plot.no_such_vec").unwrap_err();
    assert!(matches!(err, NgSpiceError::VecNotFound(_)));
}

#[test]
fn nul_byte_in_command_returns_error() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "Nul test", "V1 a 0 dc 1", "R1 a 0 1k", ".op", ".end",
    ]).unwrap();
    let err = ckt.command("echo\0oops").unwrap_err();
    assert!(matches!(err, NgSpiceError::NulByte(_)));
}

#[test]
fn nul_byte_in_circuit_line_returns_error() {
    let mut guard = lock();
    let err = guard.0.load_circuit(["bad\0line", ".end"]).unwrap_err();
    assert!(matches!(err, NgSpiceError::NulByte(_)));
}

// ---------------------------------------------------------------------------
// XSPICE code model tests
// ---------------------------------------------------------------------------

/// Register a Rust gain model: V1=3, gain=2 → v(out) = 6.
#[test]
fn xspice_rust_gain_model() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "XSPICE gain test",
        "V1 in 0 dc 3",
        ".model mygain rust_gain gain=2.0",
        "A1 in out mygain",
        "R_load out 0 1k",
        ".op",
        ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let plot = ckt.current_plot().unwrap();
    let v_out = ckt.vec_data(&format!("{plot}.out")).unwrap();
    let val = v_out.real.as_deref().unwrap()[0];
    assert!(
        (val - 6.0).abs() < 1e-6,
        "expected v(out)≈6.0, got {val}"
    );
}

/// Same gain model but use default gain=1.0 → v(out) = 3.
#[test]
fn xspice_rust_model_default_params() {
    let mut guard = lock();
    let mut ckt = guard.0.load_circuit([
        "XSPICE default param test",
        "V1 in 0 dc 3",
        ".model mygain2 rust_gain",
        "A1 in out mygain2",
        "R_load out 0 1k",
        ".op",
        ".end",
    ]).unwrap();
    ckt.run().unwrap();

    let plot = ckt.current_plot().unwrap();
    let v_out = ckt.vec_data(&format!("{plot}.out")).unwrap();
    let val = v_out.real.as_deref().unwrap()[0];
    assert!(
        (val - 3.0).abs() < 1e-6,
        "expected v(out)≈3.0, got {val}"
    );
}
