//! Safe Rust bindings to the [ngspice](https://ngspice.sourceforge.io/) shared
//! library.
//!
//! # Architecture
//!
//! ```text
//!  NgSpice  ──load_circuit()──►  Circuit<'_>
//!  (init)                        (borrow of &mut NgSpice)
//!                                 │
//!                                 ├─ run()
//!                                 ├─ command()
//!                                 ├─ vec_data()
//!                                 └─ Drop → remcirc
//! ```
//!
//! [`NgSpice`] is the process-wide initialisation handle.  You load a netlist
//! into it with [`NgSpice::load_circuit`], which gives back a [`Circuit`] that
//! borrows `NgSpice` exclusively for its lifetime.  When the `Circuit` is
//! dropped ngspice's internal circuit state is removed via `remcirc`.
//!
//! Because `Circuit` holds `&mut NgSpice` the borrow-checker statically
//! prevents loading a second circuit while the first is still alive, and
//! prevents dropping `NgSpice` while a `Circuit` is outstanding.
//!
//! # Sequencing simulations ("queue")
//!
//! ```rust,no_run
//! # fn main() -> Result<(), ngspice::NgSpiceError> {
//! use ngspice::NgSpice;
//!
//! let mut ng = NgSpice::init(|msg| eprint!("{msg}"), |_| {})?;
//!
//! // First simulation
//! {
//!     let mut ckt = ng.load_circuit([
//!         "Divider", "V1 in 0 dc 5", "R1 in mid 1k", "R2 mid 0 1k",
//!         ".op", ".end",
//!     ])?;
//!     ckt.run()?;
//!     let plot = ckt.current_plot()?;
//!     let v = ckt.vec_data(&format!("{plot}.mid"))?;
//!     println!("v(mid) = {:?}", v.real);
//! } // ← Circuit dropped here → remcirc called automatically
//!
//! // Second simulation reuses the same NgSpice
//! {
//!     let mut ckt = ng.load_circuit([
//!         "RC", "V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)",
//!         "R1 in out 1k", "C1 out 0 1u",
//!         ".tran 0.1m 5m", ".end",
//!     ])?;
//!     ckt.run()?;
//! }
//! # Ok(()) }
//! ```
//!
//! # Process-wide singleton
//!
//! ngspice maintains global C state; [`NgSpice::init`] may only be called once
//! per process.  A second call returns [`NgSpiceError::AlreadyInitialized`].
//!
//! # Thread safety
//!
//! [`NgSpice`] and [`Circuit`] are both `!Send + !Sync`.  Create and use them
//! on one thread only.  The *callback* closures passed to [`NgSpice::init`]
//! must be `Send + Sync + 'static` because ngspice may call them from its own
//! background simulation thread.

use std::ffi::{CStr, CString, NulError};
use std::marker::PhantomData;
use std::os::raw::{c_char, c_int, c_void};
use std::sync::OnceLock;

use ngspice_sys as sys;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum NgSpiceError {
    #[error("ngspice is already initialized — only one instance is allowed per process")]
    AlreadyInitialized,

    #[error("ngSpice_Init returned non-zero: {0}")]
    InitFailed(i32),

    #[error("string contains an interior nul byte")]
    NulByte(#[from] NulError),

    #[error("ngSpice_Command returned non-zero: {0}")]
    CommandFailed(i32),

    #[error("ngSpice_Circ returned non-zero: {0}")]
    CircFailed(i32),

    #[error("ngSpice_CurPlot returned a null pointer")]
    NullPlot,

    #[error("vector not found: {0}")]
    VecNotFound(String),
}

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

/// Simulation vector data copied out of ngspice's internal buffers.
///
/// Exactly one of [`real`](VecData::real) or [`complex`](VecData::complex)
/// will be `Some`.  Both may be `None` for an empty vector.
#[derive(Debug, Clone)]
pub struct VecData {
    /// The vector name as reported by ngspice.
    pub name: String,
    /// Real-valued data points.
    pub real: Option<Vec<f64>>,
    /// Complex data points as `[real_part, imag_part]` pairs.
    pub complex: Option<Vec<[f64; 2]>>,
}

// ---------------------------------------------------------------------------
// Internal callback state
// ---------------------------------------------------------------------------

/// Heap-allocated closure storage intentionally leaked after `NgSpice::init`.
///
/// The raw pointer is passed as `void* userdata` to ngspice and handed back
/// on every callback invocation for the lifetime of the process.
struct Callbacks {
    on_output: Box<dyn Fn(&str) + Send + Sync>,
    on_exit: Box<dyn Fn(i32) + Send + Sync>,
}

// ---- Trampolines -----------------------------------------------------------
//
// Safety invariant: `userdata` is always a `*mut Callbacks` created by
// `Box::into_raw` in `NgSpice::init` and never freed.

unsafe extern "C" fn trampoline_send_char(
    output: *mut c_char,
    _ident: c_int,
    userdata: *mut c_void,
) -> c_int {
    let cb = unsafe { &*(userdata as *const Callbacks) };
    let s = unsafe { CStr::from_ptr(output) }.to_string_lossy();
    (cb.on_output)(&s);
    0
}

unsafe extern "C" fn trampoline_send_stat(
    status: *mut c_char,
    _ident: c_int,
    userdata: *mut c_void,
) -> c_int {
    let cb = unsafe { &*(userdata as *const Callbacks) };
    let s = unsafe { CStr::from_ptr(status) }.to_string_lossy();
    (cb.on_output)(&s);
    0
}

unsafe extern "C" fn trampoline_controlled_exit(
    status: c_int,
    _unloading: sys::NG_BOOL,
    _quit: sys::NG_BOOL,
    _ident: c_int,
    userdata: *mut c_void,
) -> c_int {
    let cb = unsafe { &*(userdata as *const Callbacks) };
    (cb.on_exit)(status);
    0
}

unsafe extern "C" fn trampoline_send_data(
    _: sys::pvecvaluesall,
    _: c_int,
    _: c_int,
    _: *mut c_void,
) -> c_int {
    0
}

unsafe extern "C" fn trampoline_send_init_data(
    _: sys::pvecinfoall,
    _: c_int,
    _: *mut c_void,
) -> c_int {
    0
}

unsafe extern "C" fn trampoline_bg_thread_running(
    _: sys::NG_BOOL,
    _: c_int,
    _: *mut c_void,
) -> c_int {
    0
}

// ---------------------------------------------------------------------------
// Singleton guard
// ---------------------------------------------------------------------------

static INITIALIZED: OnceLock<()> = OnceLock::new();

// ---------------------------------------------------------------------------
// NgSpice — initialisation handle
// ---------------------------------------------------------------------------

/// Process-wide initialisation handle for the ngspice shared library.
///
/// Obtain one via [`NgSpice::init`].  Use [`NgSpice::load_circuit`] to load
/// a netlist and get a [`Circuit`] to run simulations.
///
/// `NgSpice` is `!Send + !Sync`; keep it on one thread.
#[derive(Debug)]
pub struct NgSpice {
    _not_send_sync: PhantomData<*mut ()>,
}

impl NgSpice {
    /// Initialise ngspice and register output callbacks.
    ///
    /// * `on_output` — every line ngspice writes (stdout, stderr, status).
    ///   Called from ngspice's background thread; must be `Send + Sync`.
    /// * `on_exit` — called when ngspice signals a controlled exit.
    ///
    /// Returns [`NgSpiceError::AlreadyInitialized`] on a second call.
    pub fn init(
        on_output: impl Fn(&str) + Send + Sync + 'static,
        on_exit: impl Fn(i32) + Send + Sync + 'static,
    ) -> Result<Self, NgSpiceError> {
        INITIALIZED
            .set(())
            .map_err(|_| NgSpiceError::AlreadyInitialized)?;

        let userdata: *mut c_void = Box::into_raw(Box::new(Callbacks {
            on_output: Box::new(on_output),
            on_exit: Box::new(on_exit),
        })) as *mut c_void;

        // SAFETY: trampolines have correct C signatures; userdata is a valid
        // heap pointer that is intentionally leaked and lives forever.
        let rc = unsafe {
            sys::ngSpice_Init(
                Some(trampoline_send_char),
                Some(trampoline_send_stat),
                Some(trampoline_controlled_exit),
                Some(trampoline_send_data),
                Some(trampoline_send_init_data),
                Some(trampoline_bg_thread_running),
                userdata,
            )
        };

        if rc != 0 {
            return Err(NgSpiceError::InitFailed(rc));
        }

        Ok(NgSpice { _not_send_sync: PhantomData })
    }

    /// Load a SPICE netlist and return a [`Circuit`] handle.
    ///
    /// The `Circuit` borrows `self` mutably, so only one can exist at a time.
    /// Drop the `Circuit` (which calls `remcirc` automatically) before loading
    /// the next one.
    ///
    /// `lines` is an iterator of netlist lines.  The final `.end` line is
    /// required; a `NULL` sentinel is appended automatically.
    pub fn load_circuit<'ng, 'a>(
        &'ng mut self,
        lines: impl IntoIterator<Item = &'a str>,
    ) -> Result<Circuit<'ng>, NgSpiceError> {
        let cstrings: Vec<CString> = lines
            .into_iter()
            .map(CString::new)
            .collect::<Result<_, _>>()?;

        let mut ptrs: Vec<*mut c_char> = cstrings
            .iter()
            .map(|s| s.as_ptr() as *mut c_char)
            .collect();
        ptrs.push(std::ptr::null_mut());

        // SAFETY: ptrs is a valid null-terminated char** array; all CStrings
        // outlive this call; ngSpice_Circ reads them synchronously.
        let rc = unsafe { sys::ngSpice_Circ(ptrs.as_mut_ptr()) };
        if rc != 0 {
            return Err(NgSpiceError::CircFailed(rc));
        }

        Ok(Circuit { _ng: self, _not_send_sync: PhantomData })
    }

    /// Disable reading ngspice's global `spinit` init file.
    ///
    /// Must be called **before** [`NgSpice::init`].
    pub fn suppress_spinit() {
        unsafe { sys::ngSpice_nospinit() };
    }

    /// Convert this handle into a [`NgSpiceSession`] for long-lived or
    /// session-based use where multiple operations interleave without
    /// the compile-time lifetime coupling enforced by [`Circuit`].
    pub fn into_session(self) -> NgSpiceSession {
        NgSpiceSession { _ng: self, circuit_loaded: false }
    }

}

// ---------------------------------------------------------------------------
// NgSpiceSession — session-mode wrapper (no Circuit lifetime coupling)
// ---------------------------------------------------------------------------

/// Long-lived ngspice session handle.
///
/// Unlike the [`NgSpice`] + [`Circuit`] pair, all operations are available
/// on this type directly.  The trade-off is that the compiler cannot
/// statically guarantee a circuit is loaded before commands are run — callers
/// get runtime errors instead.
///
/// Obtain via [`NgSpice::into_session`] or [`NgSpice::session_from_zygote`].
///
/// `NgSpiceSession` is `!Send + !Sync` for the same reasons as [`NgSpice`].
pub struct NgSpiceSession {
    _ng: NgSpice,
    circuit_loaded: bool,
}

impl NgSpiceSession {
    /// Load a SPICE netlist, replacing any previously loaded circuit.
    ///
    /// `lines` must include a `.end` line; a `NULL` sentinel is appended
    /// automatically.
    pub fn load_circuit<'a>(
        &mut self,
        lines: impl IntoIterator<Item = &'a str>,
    ) -> Result<(), NgSpiceError> {
        // Remove the previous circuit if one was loaded.
        if self.circuit_loaded {
            // Ignore errors — if no circuit was loaded this is a no-op.
            unsafe { sys::ngSpice_Command(b"remcirc\0".as_ptr() as *mut c_char) };
            self.circuit_loaded = false;
        }

        let cstrings: Vec<CString> = lines
            .into_iter()
            .map(CString::new)
            .collect::<Result<_, _>>()?;
        let mut ptrs: Vec<*mut c_char> = cstrings
            .iter()
            .map(|s| s.as_ptr() as *mut c_char)
            .collect();
        ptrs.push(std::ptr::null_mut());

        let rc = unsafe { sys::ngSpice_Circ(ptrs.as_mut_ptr()) };
        if rc != 0 {
            return Err(NgSpiceError::CircFailed(rc));
        }
        self.circuit_loaded = true;
        Ok(())
    }

    /// Send any ngspice interactive command.
    pub fn command(&mut self, cmd: &str) -> Result<(), NgSpiceError> {
        let c = CString::new(cmd)?;
        let rc = unsafe { sys::ngSpice_Command(c.as_ptr() as *mut c_char) };
        if rc != 0 { Err(NgSpiceError::CommandFailed(rc)) } else { Ok(()) }
    }

    /// Run the loaded simulation (equivalent to `command("run")`).
    pub fn run(&mut self) -> Result<(), NgSpiceError> {
        self.command("run")
    }

    /// Name of the current active plot (e.g. `"op1"`, `"tran2"`).
    pub fn current_plot(&self) -> Result<String, NgSpiceError> {
        let ptr = unsafe { sys::ngSpice_CurPlot() };
        if ptr.is_null() {
            return Err(NgSpiceError::NullPlot);
        }
        Ok(unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned())
    }

    /// Names of all plots created so far in this session.
    pub fn all_plots(&self) -> Vec<String> {
        collect_str_array(unsafe { sys::ngSpice_AllPlots() })
    }

    /// Names of all vectors in `plot`.
    pub fn all_vecs(&self, plot: &str) -> Result<Vec<String>, NgSpiceError> {
        let c = CString::new(plot)?;
        Ok(collect_str_array(unsafe {
            sys::ngSpice_AllVecs(c.as_ptr() as *mut c_char)
        }))
    }

    /// Copy a simulation vector out of ngspice's internal buffers.
    pub fn vec_data(&self, vecname: &str) -> Result<VecData, NgSpiceError> {
        let c = CString::new(vecname)?;
        let info_ptr = unsafe { sys::ngGet_Vec_Info(c.as_ptr() as *mut c_char) };
        if info_ptr.is_null() {
            return Err(NgSpiceError::VecNotFound(vecname.to_owned()));
        }
        let info = unsafe { &*info_ptr };

        let name = if info.v_name.is_null() {
            vecname.to_owned()
        } else {
            unsafe { CStr::from_ptr(info.v_name) }.to_string_lossy().into_owned()
        };
        let length = info.v_length as usize;
        let real = (!info.v_realdata.is_null() && length > 0).then(|| {
            unsafe { std::slice::from_raw_parts(info.v_realdata, length) }.to_vec()
        });
        let complex = (!info.v_compdata.is_null() && length > 0).then(|| {
            unsafe { std::slice::from_raw_parts(info.v_compdata, length) }
                .iter()
                .map(|c| [c.cx_real, c.cx_imag])
                .collect::<Vec<_>>()
        });
        Ok(VecData { name, real, complex })
    }

    /// `true` if ngspice is running a simulation in its background thread.
    pub fn is_running(&self) -> bool {
        unsafe { sys::ngSpice_running() }
    }

    /// Set a breakpoint at `time` seconds (transient simulation).
    pub fn set_breakpoint(&self, time: f64) -> bool {
        unsafe { sys::ngSpice_SetBkpt(time) }
    }

    /// Remove the currently loaded circuit, freeing ngspice's internal state.
    pub fn remcirc(&mut self) {
        if self.circuit_loaded {
            unsafe { sys::ngSpice_Command(b"remcirc\0".as_ptr() as *mut c_char) };
            self.circuit_loaded = false;
        }
    }
}

// ---------------------------------------------------------------------------
// Circuit — RAII simulation handle
// ---------------------------------------------------------------------------

/// An active ngspice circuit, obtained from [`NgSpice::load_circuit`].
///
/// `Circuit` mutably borrows the [`NgSpice`] it came from, so you cannot load
/// a second circuit until this one is dropped.  On drop, `remcirc` is called
/// to remove the circuit from ngspice's internal list.
///
/// All simulation data is **copied** out of ngspice's buffers on retrieval, so
/// [`VecData`] values are fully owned and have no lifetime dependency on
/// `Circuit` or [`NgSpice`].
pub struct Circuit<'ng> {
    _ng: &'ng mut NgSpice,
    _not_send_sync: PhantomData<*mut ()>,
}

impl std::fmt::Debug for Circuit<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Circuit")
    }
}

impl Circuit<'_> {
    // ---- Running simulations -----------------------------------------------

    /// Run the loaded simulation synchronously (blocks until complete).
    ///
    /// Equivalent to `self.command("run")`.
    pub fn run(&mut self) -> Result<(), NgSpiceError> {
        self.command("run")
    }

    /// Send any ngspice interactive command (executed immediately).
    pub fn command(&mut self, cmd: &str) -> Result<(), NgSpiceError> {
        let c = CString::new(cmd)?;
        // SAFETY: c is a valid nul-terminated string; ngSpice_Command reads
        // it synchronously and does not retain the pointer.
        let rc = unsafe { sys::ngSpice_Command(c.as_ptr() as *mut c_char) };
        if rc != 0 {
            Err(NgSpiceError::CommandFailed(rc))
        } else {
            Ok(())
        }
    }

    // ---- Querying results --------------------------------------------------

    /// Name of the current active plot (e.g. `"op1"`, `"tran2"`).
    pub fn current_plot(&self) -> Result<String, NgSpiceError> {
        let ptr = unsafe { sys::ngSpice_CurPlot() };
        if ptr.is_null() {
            return Err(NgSpiceError::NullPlot);
        }
        Ok(unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned())
    }

    /// Names of all plots created so far in this ngspice session.
    pub fn all_plots(&self) -> Result<Vec<String>, NgSpiceError> {
        Ok(collect_str_array(unsafe { sys::ngSpice_AllPlots() }))
    }

    /// Names of all vectors in `plot` (e.g. `"tran1"`).
    pub fn all_vecs(&self, plot: &str) -> Result<Vec<String>, NgSpiceError> {
        let c = CString::new(plot)?;
        Ok(collect_str_array(unsafe {
            sys::ngSpice_AllVecs(c.as_ptr() as *mut c_char)
        }))
    }

    /// Copy a simulation vector out of ngspice's internal buffers.
    ///
    /// `vecname` may be bare (`"v(out)"`) or plot-qualified
    /// (`"tran1.v(out)"`).  The returned [`VecData`] is fully owned.
    pub fn vec_data(&self, vecname: &str) -> Result<VecData, NgSpiceError> {
        let c = CString::new(vecname)?;

        // SAFETY: returns a raw pointer into ngspice's internals, valid until
        // the next simulation or reset.  We copy all data before returning.
        let info_ptr = unsafe { sys::ngGet_Vec_Info(c.as_ptr() as *mut c_char) };
        if info_ptr.is_null() {
            return Err(NgSpiceError::VecNotFound(vecname.to_owned()));
        }

        // SAFETY: non-null, valid `vector_info`; we take a shared ref and
        // copy all pointed-to data before the function returns.
        let info = unsafe { &*info_ptr };

        let name = if info.v_name.is_null() {
            vecname.to_owned()
        } else {
            unsafe { CStr::from_ptr(info.v_name) }
                .to_string_lossy()
                .into_owned()
        };

        let length = info.v_length as usize;

        let real = (!info.v_realdata.is_null() && length > 0).then(|| {
            // SAFETY: v_realdata is a valid array of v_length f64 values.
            unsafe { std::slice::from_raw_parts(info.v_realdata, length) }.to_vec()
        });

        let complex = (!info.v_compdata.is_null() && length > 0).then(|| {
            // SAFETY: v_compdata is a valid array of v_length ngcomplex_t.
            unsafe { std::slice::from_raw_parts(info.v_compdata, length) }
                .iter()
                .map(|c| [c.cx_real, c.cx_imag])
                .collect::<Vec<_>>()
        });

        Ok(VecData { name, real, complex })
    }

    // ---- Status ------------------------------------------------------------

    /// `true` if ngspice is running a simulation in its background thread.
    pub fn is_running(&self) -> bool {
        unsafe { sys::ngSpice_running() }
    }

    /// Set a breakpoint at `time` seconds (transient simulation).
    pub fn set_breakpoint(&self, time: f64) -> bool {
        unsafe { sys::ngSpice_SetBkpt(time) }
    }
}

impl Drop for Circuit<'_> {
    fn drop(&mut self) {
        // Remove the circuit from ngspice's internal list.  Errors are silently
        // ignored — we're in Drop and cannot propagate them.
        // SAFETY: "remcirc\0" is a valid nul-terminated C string literal.
        unsafe {
            sys::ngSpice_Command(b"remcirc\0".as_ptr() as *mut c_char);
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Walk a null-terminated `char**` and copy each entry into a `Vec<String>`.
fn collect_str_array(ptr: *mut *mut c_char) -> Vec<String> {
    if ptr.is_null() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut i = 0usize;
    loop {
        // SAFETY: the array is null-terminated; we stop at the first null.
        let entry = unsafe { *ptr.add(i) };
        if entry.is_null() {
            break;
        }
        out.push(unsafe { CStr::from_ptr(entry) }.to_string_lossy().into_owned());
        i += 1;
    }
    out
}
