//! Safe Rust API for defining and registering XSPICE code models.
//!
//! This module lets you define custom analog code models in Rust and
//! register them with ngspice so they can be used in SPICE netlists
//! via the `A` device syntax.
//!
//! # Example
//!
//! ```rust,no_run
//! use ngspice::code_model::*;
//!
//! let model = CodeModelBuilder::new("rust_gain", "Gain block")
//!     .conn(ConnSpec::new("in", Direction::In, PortType::Voltage))
//!     .conn(ConnSpec::new("out", Direction::Out, PortType::Voltage))
//!     .param(ParamSpec::real("gain", 1.0))
//!     .build(|ctx| {
//!         let gain = ctx.param_real(0);
//!         let input = ctx.input_real(0, 0);
//!         ctx.set_output_real(1, 0, gain * input);
//!         ctx.set_partial(1, 0, 0, 0, gain);
//!     });
//! ```

use std::ffi::CString;
use std::os::raw::{c_char, c_int};
use std::ptr;

use ngspice_sys as sys;

// ---------------------------------------------------------------------------
// IFparm dataType constants (from ifsim.h, #defines not emitted by bindgen)
// ---------------------------------------------------------------------------

const IF_FLAG: c_int = 0x1;
const IF_INTEGER: c_int = 0x2;
const IF_REAL: c_int = 0x4;
const IF_SET: c_int = 0x2000;
const IF_ASK: c_int = 0x1000;

// ---------------------------------------------------------------------------
// Safe enums
// ---------------------------------------------------------------------------

/// Connection direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    In,
    Out,
    InOut,
}

impl Direction {
    fn to_sys(self) -> sys::Mif_Dir_t {
        match self {
            Direction::In => sys::Mif_Dir_t_MIF_IN,
            Direction::Out => sys::Mif_Dir_t_MIF_OUT,
            Direction::InOut => sys::Mif_Dir_t_MIF_INOUT,
        }
    }
}

/// Port type for a connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortType {
    Voltage,
    DiffVoltage,
    Current,
    DiffCurrent,
    VsourceCurrent,
    Conductance,
    DiffConductance,
    Resistance,
    DiffResistance,
}

impl PortType {
    fn to_sys(self) -> sys::Mif_Port_Type_t {
        match self {
            PortType::Voltage => sys::Mif_Port_Type_t_MIF_VOLTAGE,
            PortType::DiffVoltage => sys::Mif_Port_Type_t_MIF_DIFF_VOLTAGE,
            PortType::Current => sys::Mif_Port_Type_t_MIF_CURRENT,
            PortType::DiffCurrent => sys::Mif_Port_Type_t_MIF_DIFF_CURRENT,
            PortType::VsourceCurrent => sys::Mif_Port_Type_t_MIF_VSOURCE_CURRENT,
            PortType::Conductance => sys::Mif_Port_Type_t_MIF_CONDUCTANCE,
            PortType::DiffConductance => sys::Mif_Port_Type_t_MIF_DIFF_CONDUCTANCE,
            PortType::Resistance => sys::Mif_Port_Type_t_MIF_RESISTANCE,
            PortType::DiffResistance => sys::Mif_Port_Type_t_MIF_DIFF_RESISTANCE,
        }
    }

    fn type_str(self) -> &'static str {
        match self {
            PortType::Voltage => "v",
            PortType::DiffVoltage => "vd",
            PortType::Current => "i",
            PortType::DiffCurrent => "id",
            PortType::VsourceCurrent => "vnam",
            PortType::Conductance => "g",
            PortType::DiffConductance => "gd",
            PortType::Resistance => "h",
            PortType::DiffResistance => "hd",
        }
    }
}

/// Analysis type reported by [`CodeModelCtx::analysis_type`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisType {
    Dc,
    Ac,
    Tran,
    Unknown(u32),
}

impl AnalysisType {
    fn from_sys(v: sys::Mif_Analysis_t) -> Self {
        match v {
            sys::Mif_Analysis_t_MIF_DC => AnalysisType::Dc,
            sys::Mif_Analysis_t_MIF_AC => AnalysisType::Ac,
            sys::Mif_Analysis_t_MIF_TRAN => AnalysisType::Tran,
            other => AnalysisType::Unknown(other),
        }
    }
}

// ---------------------------------------------------------------------------
// Spec builders
// ---------------------------------------------------------------------------

/// Specification for one code model connection.
#[derive(Debug, Clone)]
pub struct ConnSpec {
    name: String,
    direction: Direction,
    port_type: PortType,
    null_allowed: bool,
}

impl ConnSpec {
    pub fn new(name: &str, direction: Direction, port_type: PortType) -> Self {
        ConnSpec {
            name: name.to_owned(),
            direction,
            port_type,
            null_allowed: false,
        }
    }

    pub fn null_allowed(mut self, allowed: bool) -> Self {
        self.null_allowed = allowed;
        self
    }
}

/// Specification for one code model parameter.
#[derive(Debug, Clone)]
pub enum ParamSpec {
    Real { name: String, default: f64 },
    Integer { name: String, default: i32 },
    Boolean { name: String, default: bool },
}

impl ParamSpec {
    pub fn real(name: &str, default: f64) -> Self {
        ParamSpec::Real { name: name.to_owned(), default }
    }

    pub fn integer(name: &str, default: i32) -> Self {
        ParamSpec::Integer { name: name.to_owned(), default }
    }

    pub fn boolean(name: &str, default: bool) -> Self {
        ParamSpec::Boolean { name: name.to_owned(), default }
    }
}

// ---------------------------------------------------------------------------
// CodeModelCtx — safe wrapper around *mut Mif_Private
// ---------------------------------------------------------------------------

/// Safe wrapper around the `Mif_Private` struct passed to code model callbacks.
///
/// # Safety
///
/// Must only be constructed via [`from_raw`](CodeModelCtx::from_raw) inside a
/// code model callback, with a valid pointer provided by ngspice.
pub struct CodeModelCtx {
    ptr: *mut sys::Mif_Private,
}

impl CodeModelCtx {
    /// Wrap a raw `Mif_Private` pointer.
    ///
    /// # Safety
    ///
    /// `ptr` must be a valid, non-null pointer to a `Mif_Private` struct
    /// provided by ngspice during a code model callback invocation.
    pub unsafe fn from_raw(ptr: *mut sys::Mif_Private) -> Self {
        debug_assert!(!ptr.is_null());
        CodeModelCtx { ptr }
    }

    fn priv_ref(&self) -> &sys::Mif_Private {
        unsafe { &*self.ptr }
    }

    /// Current analysis type.
    pub fn analysis_type(&self) -> AnalysisType {
        AnalysisType::from_sys(self.priv_ref().circuit.anal_type)
    }

    /// `true` on the first call (initialisation pass).
    pub fn is_init(&self) -> bool {
        self.priv_ref().circuit.init != 0
    }

    /// Current simulation time (transient analysis).
    pub fn time(&self) -> f64 {
        self.priv_ref().circuit.time
    }

    /// Read a real-valued input from connection `conn`, port `port`.
    pub fn input_real(&self, conn: usize, port: usize) -> f64 {
        unsafe {
            let conn_data = *(*self.ptr).conn.add(conn);
            let port_data = *(*conn_data).port.add(port);
            (*port_data).input.rvalue
        }
    }

    /// Set a real-valued output on connection `conn`, port `port`.
    pub fn set_output_real(&self, conn: usize, port: usize, value: f64) {
        unsafe {
            let conn_data = *(*self.ptr).conn.add(conn);
            let port_data = *(*conn_data).port.add(port);
            (*port_data).output.rvalue = value;
        }
    }

    /// Set the partial derivative ∂(output_conn[output_port])/∂(input_conn[input_port]).
    pub fn set_partial(
        &self,
        output_conn: usize,
        output_port: usize,
        input_conn: usize,
        input_port: usize,
        value: f64,
    ) {
        unsafe {
            let conn_data = *(*self.ptr).conn.add(output_conn);
            let port_data = *(*conn_data).port.add(output_port);
            let partial = (*port_data).partial.add(input_conn);
            *(*partial).port.add(input_port) = value;
        }
    }

    /// Read a real parameter at index `idx`.
    pub fn param_real(&self, idx: usize) -> f64 {
        unsafe {
            let param_data = *(*self.ptr).param.add(idx);
            (*(*param_data).element).rvalue
        }
    }

    /// Read an integer parameter at index `idx`.
    pub fn param_int(&self, idx: usize) -> i32 {
        unsafe {
            let param_data = *(*self.ptr).param.add(idx);
            (*(*param_data).element).ivalue
        }
    }

    /// Read a boolean parameter at index `idx`.
    pub fn param_bool(&self, idx: usize) -> bool {
        unsafe {
            let param_data = *(*self.ptr).param.add(idx);
            (*(*param_data).element).bvalue != 0
        }
    }

    /// `true` if the parameter at `idx` was not specified on the `.model` card.
    pub fn param_is_null(&self, idx: usize) -> bool {
        unsafe {
            let param_data = *(*self.ptr).param.add(idx);
            (*param_data).is_null != 0
        }
    }
}

// ---------------------------------------------------------------------------
// CodeModelBuilder
// ---------------------------------------------------------------------------

/// Fluent builder for constructing a [`CodeModel`].
pub struct CodeModelBuilder {
    name: String,
    description: String,
    conns: Vec<ConnSpec>,
    params: Vec<ParamSpec>,
}

impl CodeModelBuilder {
    pub fn new(name: &str, description: &str) -> Self {
        CodeModelBuilder {
            name: name.to_owned(),
            description: description.to_owned(),
            conns: Vec::new(),
            params: Vec::new(),
        }
    }

    pub fn conn(mut self, spec: ConnSpec) -> Self {
        self.conns.push(spec);
        self
    }

    pub fn param(mut self, spec: ParamSpec) -> Self {
        self.params.push(spec);
        self
    }

    /// Consume the builder and produce a [`CodeModel`] ready for registration.
    ///
    /// The callback receives a `&CodeModelCtx` and can be any `Fn` — plain
    /// functions, closures with captures, etc.  The closure is leaked (lives
    /// for the duration of the process, matching ngspice's ownership model).
    pub fn build(self, callback: impl Fn(&CodeModelCtx) + 'static) -> CodeModel {
        // Leak the closure onto the heap — ngspice owns the device forever.
        let user_data: *mut Box<dyn Fn(&CodeModelCtx)> =
            Box::into_raw(Box::new(Box::new(callback) as Box<dyn Fn(&CodeModelCtx)>));

        // All heap allocations here are intentionally leaked — ngspice takes
        // ownership of the SPICEdev struct and its sub-allocations forever.

        let name_c = leak_cstring(&self.name);
        let desc_c = leak_cstring(&self.description);

        // --- Connections ---
        let num_conn = self.conns.len() as c_int;
        let conn_infos = if self.conns.is_empty() {
            ptr::null_mut()
        } else {
            let mut infos: Vec<sys::Mif_Conn_Info> = self
                .conns
                .iter()
                .map(|c| {
                    let type_str = leak_cstring(c.port_type.type_str());
                    let mut allowed_type = Box::new(c.port_type.to_sys());
                    let allowed_type_ptr = &mut *allowed_type as *mut _;
                    std::mem::forget(allowed_type);

                    let mut allowed_type_str = Box::new(type_str as *mut c_char);
                    let allowed_type_str_ptr = &mut *allowed_type_str as *mut _;
                    std::mem::forget(allowed_type_str);

                    sys::Mif_Conn_Info {
                        name: leak_cstring(&c.name),
                        description: leak_cstring(&c.name),
                        direction: c.direction.to_sys(),
                        default_port_type: c.port_type.to_sys(),
                        default_type: type_str,
                        num_allowed_types: 1,
                        allowed_type: allowed_type_ptr,
                        allowed_type_str: allowed_type_str_ptr,
                        is_array: 0, // MIF_FALSE
                        has_lower_bound: 0,
                        lower_bound: 0,
                        has_upper_bound: 0,
                        upper_bound: 0,
                        null_allowed: if c.null_allowed { 1 } else { 0 },
                    }
                })
                .collect();
            let ptr = infos.as_mut_ptr();
            std::mem::forget(infos);
            ptr
        };

        // --- Parameters ---
        let num_param = self.params.len() as c_int;

        // Build Mif_Param_Info array (for the XSPICE parser)
        let param_infos = if self.params.is_empty() {
            ptr::null_mut()
        } else {
            let mut infos: Vec<sys::Mif_Param_Info> = self
                .params
                .iter()
                .map(|p| {
                    let (name, mif_type, default_val) = match p {
                        ParamSpec::Real { name, default } => {
                            let mut v: sys::Mif_Parse_Value = unsafe { std::mem::zeroed() };
                            v.rvalue = *default;
                            (name.as_str(), sys::Mif_Data_Type_t_MIF_REAL, v)
                        }
                        ParamSpec::Integer { name, default } => {
                            let mut v: sys::Mif_Parse_Value = unsafe { std::mem::zeroed() };
                            v.ivalue = *default;
                            (name.as_str(), sys::Mif_Data_Type_t_MIF_INTEGER, v)
                        }
                        ParamSpec::Boolean { name, default } => {
                            let mut v: sys::Mif_Parse_Value = unsafe { std::mem::zeroed() };
                            v.bvalue = if *default { 1 } else { 0 };
                            (name.as_str(), sys::Mif_Data_Type_t_MIF_BOOLEAN, v)
                        }
                    };

                    // default_values is a heap array of size 1
                    let mut defaults = vec![default_val];
                    let defaults_ptr = defaults.as_mut_ptr();
                    std::mem::forget(defaults);

                    sys::Mif_Param_Info {
                        name: leak_cstring(name),
                        description: leak_cstring(name),
                        type_: mif_type,
                        default_value_siz: 1,
                        default_values: defaults_ptr,
                        has_lower_limit: 0,
                        lower_limit: unsafe { std::mem::zeroed() },
                        has_upper_limit: 0,
                        upper_limit: unsafe { std::mem::zeroed() },
                        is_array: 0,
                        has_conn_ref: 0,
                        conn_ref: 0,
                        has_lower_bound: 0,
                        lower_bound: 0,
                        has_upper_bound: 0,
                        upper_bound: 0,
                        null_allowed: 1, // allow null (use default)
                    }
                })
                .collect();
            let ptr = infos.as_mut_ptr();
            std::mem::forget(infos);
            ptr
        };

        // Build IFparm array (for model parameter parsing)
        let model_parms = if self.params.is_empty() {
            ptr::null_mut()
        } else {
            let mut parms: Vec<sys::IFparm> = self
                .params
                .iter()
                .enumerate()
                .map(|(i, p)| {
                    let (name, if_type) = match p {
                        ParamSpec::Real { name, .. } => (name.as_str(), IF_REAL),
                        ParamSpec::Integer { name, .. } => (name.as_str(), IF_INTEGER),
                        ParamSpec::Boolean { name, .. } => (name.as_str(), IF_FLAG),
                    };
                    sys::IFparm {
                        keyword: leak_cstring(name),
                        id: i as c_int,
                        dataType: if_type | IF_SET | IF_ASK,
                        description: leak_cstring(name),
                    }
                })
                .collect();
            let ptr = parms.as_mut_ptr();
            std::mem::forget(parms);
            ptr
        };

        // --- Static ints for terms/numNames/numInstanceParms/numModelParms ---
        let terms = leak_box(0i32);
        let num_names = leak_box(0i32);
        let num_instance_parms = leak_box(0i32);
        let num_model_parms = leak_box(num_param);

        // --- Build SPICEdev ---
        let dev = Box::new(sys::SPICEdev {
            DEVpublic: sys::IFdevice {
                name: name_c,
                description: desc_c,
                terms,
                numNames: num_names,
                termNames: ptr::null_mut(),
                numInstanceParms: num_instance_parms,
                instanceParms: ptr::null_mut(),
                numModelParms: num_model_parms,
                modelParms: model_parms,
                cm_func: Some(cm_trampoline),
                cm_user_data: user_data as *mut std::ffi::c_void,
                num_conn,
                conn: conn_infos,
                num_param,
                param: param_infos,
                num_inst_var: 0,
                inst_var: ptr::null_mut(),
                flags: 0,
            },
            DEVparam: None,
            DEVmodParam: Some(sys::MIFmParam),
            DEVload: Some(sys::MIFload),
            DEVsetup: Some(sys::MIFsetup),
            DEVunsetup: Some(sys::MIFunsetup),
            DEVpzSetup: None,
            DEVtemperature: None,
            DEVtrunc: Some(sys::MIFtrunc),
            DEVfindBranch: None,
            DEVacLoad: None,
            DEVaccept: None,
            DEVdestroy: Some(sys::MIFdestroy),
            DEVmodDelete: Some(sys::MIFmDelete),
            DEVdelete: Some(sys::MIFdelete),
            DEVsetic: None,
            DEVask: Some(sys::MIFask),
            DEVmodAsk: Some(sys::MIFmAsk),
            DEVpzLoad: None,
            DEVconvTest: Some(sys::MIFconvTest),
            DEVsenSetup: None,
            DEVsenLoad: None,
            DEVsenUpdate: None,
            DEVsenAcLoad: None,
            DEVsenPrint: None,
            DEVsenTrunc: None,
            DEVdisto: None,
            DEVnoise: None,
            DEVsoaCheck: None,
            // add_device sets these to &MIFiSize / &MIFmSize, but we
            // must initialise them here; they'll be overwritten.
            DEVinstSize: ptr::null_mut(),
            DEVmodSize: ptr::null_mut(),
            DEVbindCSC: None,
            DEVbindCSCComplex: None,
            DEVbindCSCComplexToReal: None,
        });

        CodeModel { dev }
    }
}

// ---------------------------------------------------------------------------
// CodeModel — owns the heap-allocated SPICEdev
// ---------------------------------------------------------------------------

/// A fully constructed XSPICE code model ready for registration.
///
/// Produced by [`CodeModelBuilder::build`].  Pass to
/// [`NgSpice::register_code_model`](crate::NgSpice::register_code_model) or
/// [`NgSpiceSession::register_code_model`](crate::NgSpiceSession::register_code_model).
pub struct CodeModel {
    dev: Box<sys::SPICEdev>,
}

impl CodeModel {
    /// Register this code model with ngspice via `add_device`.
    ///
    /// # Safety
    ///
    /// Must be called after `ngSpice_Init`. ngspice takes permanent ownership
    /// of the `SPICEdev` — the `CodeModel` is intentionally leaked.
    pub(crate) unsafe fn register(self) -> c_int {
        let dev_ptr = Box::into_raw(self.dev);
        // add_device expects SPICEdev** — a pointer to an array of SPICEdev*
        let mut ptr_array = [dev_ptr];
        // flag=1 marks this as an XSPICE code model (vs flag=0 for built-in
        // SPICE devices).  The XSPICE parser checks DEVicesfl[type] != 0.
        unsafe { sys::add_device(1, ptr_array.as_mut_ptr(), 1) }
    }
}

// ---------------------------------------------------------------------------
// Trampoline
// ---------------------------------------------------------------------------

/// Single `extern "C"` trampoline used for all Rust code models.
///
/// ngspice copies `IFdevice.cm_user_data` → `Mif_Private.cm_user_data` before
/// calling `cm_func`.  We stored a leaked `Box<dyn Fn(&CodeModelCtx)>` there.
unsafe extern "C" fn cm_trampoline(mif: *mut sys::Mif_Private) {
    let ctx = unsafe { CodeModelCtx::from_raw(mif) };
    let user_data = unsafe { (*mif).cm_user_data };
    let callback = unsafe { &*(user_data as *const Box<dyn Fn(&CodeModelCtx)>) };
    callback(&ctx);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Leak a CString and return its raw pointer.
fn leak_cstring(s: &str) -> *mut c_char {
    CString::new(s).unwrap().into_raw()
}

/// Leak a boxed value and return a raw pointer.
fn leak_box<T>(v: T) -> *mut T {
    Box::into_raw(Box::new(v))
}
