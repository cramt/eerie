//! Parser and generator for SPICE netlists (ngspice dialect).
//!
//! # Quick start
//!
//! ```rust
//! use spice_netlist::{Netlist, Item, ElementKind, Expr, Source};
//!
//! // Parse a netlist from text
//! let src = "
//! Voltage divider
//! V1 in 0 DC 5
//! R1 in mid 1k
//! R2 mid 0 1k
//! .op
//! .end
//! ";
//! let netlist = Netlist::parse(src).unwrap();
//! println!("{netlist}");  // generates SPICE back out
//! ```

pub mod parse;

use std::fmt;

pub use parse::ParseError;

// ---------------------------------------------------------------------------
// Value / expression
// ---------------------------------------------------------------------------

/// A scalar value in a SPICE netlist.
///
/// SPICE supports three forms:
/// - Numeric literals with optional SI suffix: `1k`, `2.5n`, `100Meg`
/// - Parameter names: `Rval`, `myParam`
/// - Brace expressions (ngspice): `{2*Rval + 100}`
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    /// Floating-point literal (SPICE SI suffixes already applied).
    Num(f64),
    /// Reference to a `.param` by name.
    Param(String),
    /// Arbitrary expression in curly braces.
    Brace(String),
}

impl fmt::Display for Expr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Expr::Num(v) => write!(f, "{}", format_si(*v)),
            Expr::Param(s) => write!(f, "{s}"),
            Expr::Brace(s) => write!(f, "{{{s}}}"),
        }
    }
}

/// Format a float using the most compact SI suffix representation.
///
/// SPICE convention: `M` = milli (1e-3), `Meg` = mega (1e6).
pub fn format_si(val: f64) -> String {
    if val == 0.0 {
        return "0".into();
    }
    let abs = val.abs();
    let (suffix, scale) = if abs >= 1e12 {
        ("T", 1e12)
    } else if abs >= 1e9 {
        ("G", 1e9)
    } else if abs >= 1e6 {
        ("Meg", 1e6)
    } else if abs >= 1e3 {
        ("k", 1e3)
    } else if abs >= 1.0 {
        ("", 1.0)
    } else if abs >= 1e-3 {
        ("m", 1e-3)
    } else if abs >= 1e-6 {
        ("u", 1e-6)
    } else if abs >= 1e-9 {
        ("n", 1e-9)
    } else if abs >= 1e-12 {
        ("p", 1e-12)
    } else {
        ("f", 1e-15)
    };
    let scaled = val / scale;
    // Up to 9 sig figs, trailing zeros stripped
    let s = format!("{scaled:.9}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    format!("{s}{suffix}")
}

// ---------------------------------------------------------------------------
// Source waveforms (V/I sources)
// ---------------------------------------------------------------------------

/// The value specification for a voltage or current source.
///
/// A source can have a DC component, an AC component for small-signal
/// analysis, and a transient waveform — all independently optional.
#[derive(Debug, Clone, Default)]
pub struct Source {
    pub dc: Option<Expr>,
    /// `(magnitude, phase_degrees)` — phase defaults to 0.
    pub ac: Option<(Expr, Option<Expr>)>,
    pub waveform: Option<Waveform>,
}

/// Transient waveform for V/I sources.
#[derive(Debug, Clone)]
pub enum Waveform {
    /// `PULSE(v1 v2 [td [tr [tf [pw [per]]]]])`
    Pulse {
        v1: Expr,
        v2: Expr,
        td: Option<Expr>,
        tr: Option<Expr>,
        tf: Option<Expr>,
        pw: Option<Expr>,
        per: Option<Expr>,
    },
    /// `SIN(v0 va [freq [td [theta [phi]]]])`
    Sin {
        v0: Expr,
        va: Expr,
        freq: Option<Expr>,
        td: Option<Expr>,
        theta: Option<Expr>,
        phi: Option<Expr>,
    },
    /// `EXP(v1 v2 [td1 [tau1 [td2 [tau2]]]])`
    Exp {
        v1: Expr,
        v2: Expr,
        td1: Option<Expr>,
        tau1: Option<Expr>,
        td2: Option<Expr>,
        tau2: Option<Expr>,
    },
    /// `PWL(t1 v1 t2 v2 ...)`
    Pwl(Vec<(Expr, Expr)>),
    /// `SFFM(v0 va [fc [fs [md]]])`
    Sffm {
        v0: Expr,
        va: Expr,
        fc: Option<Expr>,
        fs: Option<Expr>,
        md: Option<Expr>,
    },
    /// `AM(va vo fc fs [td])`
    Am {
        va: Expr,
        vo: Expr,
        fc: Expr,
        fs: Expr,
        td: Option<Expr>,
    },
}

impl fmt::Display for Source {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts: Vec<String> = Vec::new();
        if let Some(dc) = &self.dc {
            parts.push(format!("DC {dc}"));
        }
        if let Some((mag, phase)) = &self.ac {
            if let Some(ph) = phase {
                parts.push(format!("AC {mag} {ph}"));
            } else {
                parts.push(format!("AC {mag}"));
            }
        }
        if let Some(w) = &self.waveform {
            parts.push(w.to_string());
        }
        if parts.is_empty() {
            write!(f, "0")
        } else {
            write!(f, "{}", parts.join(" "))
        }
    }
}

/// Write positional optional args, stopping before trailing Nones.
/// Intermediate Nones are written as `0`.
fn write_optional_args(f: &mut fmt::Formatter<'_>, args: &[Option<&Expr>]) -> fmt::Result {
    let last = args.iter().rposition(|a| a.is_some());
    if let Some(last_idx) = last {
        for arg in &args[..=last_idx] {
            match arg {
                Some(e) => write!(f, " {e}")?,
                None => write!(f, " 0")?,
            }
        }
    }
    Ok(())
}

impl fmt::Display for Waveform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Waveform::Pulse { v1, v2, td, tr, tf, pw, per } => {
                write!(f, "PULSE({v1} {v2}")?;
                write_optional_args(
                    f,
                    &[
                        td.as_ref(),
                        tr.as_ref(),
                        tf.as_ref(),
                        pw.as_ref(),
                        per.as_ref(),
                    ],
                )?;
                write!(f, ")")
            }
            Waveform::Sin { v0, va, freq, td, theta, phi } => {
                write!(f, "SIN({v0} {va}")?;
                write_optional_args(
                    f,
                    &[
                        freq.as_ref(),
                        td.as_ref(),
                        theta.as_ref(),
                        phi.as_ref(),
                    ],
                )?;
                write!(f, ")")
            }
            Waveform::Exp { v1, v2, td1, tau1, td2, tau2 } => {
                write!(f, "EXP({v1} {v2}")?;
                write_optional_args(
                    f,
                    &[
                        td1.as_ref(),
                        tau1.as_ref(),
                        td2.as_ref(),
                        tau2.as_ref(),
                    ],
                )?;
                write!(f, ")")
            }
            Waveform::Pwl(pairs) => {
                write!(f, "PWL(")?;
                for (i, (t, v)) in pairs.iter().enumerate() {
                    if i > 0 {
                        write!(f, " ")?;
                    }
                    write!(f, "{t} {v}")?;
                }
                write!(f, ")")
            }
            Waveform::Sffm { v0, va, fc, fs, md } => {
                write!(f, "SFFM({v0} {va}")?;
                write_optional_args(f, &[fc.as_ref(), fs.as_ref(), md.as_ref()])?;
                write!(f, ")")
            }
            Waveform::Am { va, vo, fc, fs, td } => {
                write!(f, "AM({va} {vo} {fc} {fs}")?;
                write_optional_args(f, &[td.as_ref()])?;
                write!(f, ")")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Circuit elements
// ---------------------------------------------------------------------------

/// A circuit element (single line starting with a letter).
#[derive(Debug, Clone)]
pub struct Element {
    /// Full element name including type letter, e.g. `"R1"`, `"Mfet"`.
    pub name: String,
    pub kind: ElementKind,
}

/// The body of a circuit element, keyed by the type letter.
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone)]
pub enum ElementKind {
    /// `Rname n+ n- value [params]`
    R {
        pos: String,
        neg: String,
        value: Expr,
        params: Vec<(String, Expr)>,
    },
    /// `Cname n+ n- value [IC=val]`
    C {
        pos: String,
        neg: String,
        value: Expr,
        params: Vec<(String, Expr)>,
    },
    /// `Lname n+ n- value [IC=val]`
    L {
        pos: String,
        neg: String,
        value: Expr,
        params: Vec<(String, Expr)>,
    },
    /// `Vname n+ n- source`
    V {
        pos: String,
        neg: String,
        source: Source,
    },
    /// `Iname n+ n- source`
    I {
        pos: String,
        neg: String,
        source: Source,
    },
    /// `Dname anode cathode model [params]`
    D {
        anode: String,
        cathode: String,
        model: String,
        params: Vec<(String, Expr)>,
    },
    /// `Qname c b e [substrate] model [params]`
    Q {
        c: String,
        b: String,
        e: String,
        substrate: Option<String>,
        model: String,
        params: Vec<(String, Expr)>,
    },
    /// `Mname d g s bulk model [params]`
    M {
        d: String,
        g: String,
        s: String,
        bulk: String,
        model: String,
        params: Vec<(String, Expr)>,
    },
    /// `Jname d g s model [params]`
    J {
        d: String,
        g: String,
        s: String,
        model: String,
        params: Vec<(String, Expr)>,
    },
    /// `Kname L1 L2 coupling`
    K {
        l1: String,
        l2: String,
        coupling: Expr,
    },
    /// `Ename out+ out- in+ in- gain`  (VCVS)
    E {
        out_pos: String,
        out_neg: String,
        in_pos: String,
        in_neg: String,
        gain: Expr,
    },
    /// `Fname out+ out- vsource gain`  (CCCS)
    F {
        out_pos: String,
        out_neg: String,
        vsrc: String,
        gain: Expr,
    },
    /// `Gname out+ out- in+ in- gm`  (VCCS)
    G {
        out_pos: String,
        out_neg: String,
        in_pos: String,
        in_neg: String,
        gm: Expr,
    },
    /// `Hname out+ out- vsource rm`  (CCVS)
    H {
        out_pos: String,
        out_neg: String,
        vsrc: String,
        rm: Expr,
    },
    /// `Bname n+ n- V={expr}` or `I={expr}`  (behavioural source)
    B {
        pos: String,
        neg: String,
        /// `"V={expr}"` or `"I={expr}"`
        spec: String,
    },
    /// `Xname port... subckt [PARAMS: key=val...]`
    X {
        ports: Vec<String>,
        subckt: String,
        params: Vec<(String, Expr)>,
    },
    /// Any element type not explicitly handled — stored verbatim after name.
    Raw(String),
}

fn write_params(f: &mut fmt::Formatter<'_>, params: &[(String, Expr)]) -> fmt::Result {
    for (k, v) in params {
        write!(f, " {k}={v}")?;
    }
    Ok(())
}

impl fmt::Display for Element {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.kind {
            ElementKind::R { pos, neg, value, params } => {
                write!(f, "{} {pos} {neg} {value}", self.name)?;
                write_params(f, params)
            }
            ElementKind::C { pos, neg, value, params } => {
                write!(f, "{} {pos} {neg} {value}", self.name)?;
                write_params(f, params)
            }
            ElementKind::L { pos, neg, value, params } => {
                write!(f, "{} {pos} {neg} {value}", self.name)?;
                write_params(f, params)
            }
            ElementKind::V { pos, neg, source } => {
                write!(f, "{} {pos} {neg} {source}", self.name)
            }
            ElementKind::I { pos, neg, source } => {
                write!(f, "{} {pos} {neg} {source}", self.name)
            }
            ElementKind::D { anode, cathode, model, params } => {
                write!(f, "{} {anode} {cathode} {model}", self.name)?;
                write_params(f, params)
            }
            ElementKind::Q { c, b, e, substrate, model, params } => {
                write!(f, "{} {c} {b} {e}", self.name)?;
                if let Some(sub) = substrate {
                    write!(f, " {sub}")?;
                }
                write!(f, " {model}")?;
                write_params(f, params)
            }
            ElementKind::M { d, g, s, bulk, model, params } => {
                write!(f, "{} {d} {g} {s} {bulk} {model}", self.name)?;
                write_params(f, params)
            }
            ElementKind::J { d, g, s, model, params } => {
                write!(f, "{} {d} {g} {s} {model}", self.name)?;
                write_params(f, params)
            }
            ElementKind::K { l1, l2, coupling } => {
                write!(f, "{} {l1} {l2} {coupling}", self.name)
            }
            ElementKind::E { out_pos, out_neg, in_pos, in_neg, gain } => {
                write!(f, "{} {out_pos} {out_neg} {in_pos} {in_neg} {gain}", self.name)
            }
            ElementKind::F { out_pos, out_neg, vsrc, gain } => {
                write!(f, "{} {out_pos} {out_neg} {vsrc} {gain}", self.name)
            }
            ElementKind::G { out_pos, out_neg, in_pos, in_neg, gm } => {
                write!(f, "{} {out_pos} {out_neg} {in_pos} {in_neg} {gm}", self.name)
            }
            ElementKind::H { out_pos, out_neg, vsrc, rm } => {
                write!(f, "{} {out_pos} {out_neg} {vsrc} {rm}", self.name)
            }
            ElementKind::B { pos, neg, spec } => {
                write!(f, "{} {pos} {neg} {spec}", self.name)
            }
            ElementKind::X { ports, subckt, params } => {
                write!(f, "{}", self.name)?;
                for p in ports {
                    write!(f, " {p}")?;
                }
                write!(f, " {subckt}")?;
                write_params(f, params)
            }
            ElementKind::Raw(rest) => {
                write!(f, "{} {rest}", self.name)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Analysis commands
// ---------------------------------------------------------------------------

/// Sweep variation for `.ac` and `.noise`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AcVariation {
    /// Decades: `DEC`
    Dec,
    /// Octaves: `OCT`
    Oct,
    /// Linear: `LIN`
    Lin,
}

impl fmt::Display for AcVariation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AcVariation::Dec => write!(f, "DEC"),
            AcVariation::Oct => write!(f, "OCT"),
            AcVariation::Lin => write!(f, "LIN"),
        }
    }
}

/// A simulation analysis command.
#[derive(Debug, Clone)]
pub enum Analysis {
    /// `.op`
    Op,
    /// `.dc src start stop step [src2 start2 stop2 step2]`
    Dc {
        src: String,
        start: Expr,
        stop: Expr,
        step: Expr,
        /// Optional second source sweep.
        src2: Option<(String, Expr, Expr, Expr)>,
    },
    /// `.tran tstep tstop [tstart [tmax]]`
    Tran {
        tstep: Expr,
        tstop: Expr,
        tstart: Option<Expr>,
        tmax: Option<Expr>,
    },
    /// `.ac DEC|OCT|LIN n fstart fstop`
    Ac {
        variation: AcVariation,
        n: u32,
        fstart: Expr,
        fstop: Expr,
    },
    /// `.noise out [ref] src DEC|OCT|LIN n fstart fstop`
    Noise {
        output: String,
        ref_node: Option<String>,
        src: String,
        variation: AcVariation,
        n: u32,
        fstart: Expr,
        fstop: Expr,
    },
    /// `.tf output input`
    Tf {
        output: String,
        input: String,
    },
    /// `.sens output [AC DEC n fstart fstop]`
    Sens {
        output: Vec<String>,
    },
}

impl fmt::Display for Analysis {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Analysis::Op => write!(f, ".op"),
            Analysis::Dc { src, start, stop, step, src2 } => {
                write!(f, ".dc {src} {start} {stop} {step}")?;
                if let Some((s2, a, b, c)) = src2 {
                    write!(f, " {s2} {a} {b} {c}")?;
                }
                Ok(())
            }
            Analysis::Tran { tstep, tstop, tstart, tmax } => {
                write!(f, ".tran {tstep} {tstop}")?;
                if let Some(ts) = tstart {
                    write!(f, " {ts}")?;
                    if let Some(tm) = tmax {
                        write!(f, " {tm}")?;
                    }
                }
                Ok(())
            }
            Analysis::Ac { variation, n, fstart, fstop } => {
                write!(f, ".ac {variation} {n} {fstart} {fstop}")
            }
            Analysis::Noise { output, ref_node, src, variation, n, fstart, fstop } => {
                write!(f, ".noise {output}")?;
                if let Some(r) = ref_node {
                    write!(f, " {r}")?;
                }
                write!(f, " {src} {variation} {n} {fstart} {fstop}")
            }
            Analysis::Tf { output, input } => write!(f, ".tf {output} {input}"),
            Analysis::Sens { output } => {
                write!(f, ".sens")?;
                for o in output {
                    write!(f, " {o}")?;
                }
                Ok(())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Model and subcircuit definitions
// ---------------------------------------------------------------------------

/// `.model name type [params]`
#[derive(Debug, Clone)]
pub struct ModelDef {
    pub name: String,
    /// Model type, e.g. `"NPN"`, `"NMOS"`, `"D"`.
    pub kind: String,
    pub params: Vec<(String, Expr)>,
}

impl fmt::Display for ModelDef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, ".model {} {}", self.name, self.kind)?;
        write_params(f, &self.params)
    }
}

/// `.subckt name ports [PARAMS: key=val...] ... .ends`
#[derive(Debug, Clone)]
pub struct SubcktDef {
    pub name: String,
    pub ports: Vec<String>,
    pub params: Vec<(String, Expr)>,
    pub items: Vec<Item>,
}

impl fmt::Display for SubcktDef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, ".subckt {}", self.name)?;
        for p in &self.ports {
            write!(f, " {p}")?;
        }
        if !self.params.is_empty() {
            write!(f, " PARAMS:")?;
            write_params(f, &self.params)?;
        }
        writeln!(f)?;
        for item in &self.items {
            writeln!(f, "{item}")?;
        }
        write!(f, ".ends {}", self.name)
    }
}

// ---------------------------------------------------------------------------
// Top-level item
// ---------------------------------------------------------------------------

/// A single logical line (or block) in a SPICE netlist.
#[derive(Debug, Clone)]
pub enum Item {
    /// A circuit element.
    Element(Element),
    /// A `.subckt` ... `.ends` block.
    Subckt(SubcktDef),
    /// A `.model` definition.
    Model(ModelDef),
    /// An analysis command (`.op`, `.tran`, etc.).
    Analysis(Analysis),
    /// `.param key=val [key=val ...]`
    Param(Vec<(String, Expr)>),
    /// `.include "filename"`
    Include(String),
    /// `.lib "filename" [entry]`
    Lib { file: String, entry: Option<String> },
    /// `.global node ...`
    Global(Vec<String>),
    /// `.options key=val ...`
    Options(Vec<(String, Expr)>),
    /// `.save vec ...`
    Save(Vec<String>),
    /// A full-line comment (`* ...`).
    Comment(String),
    /// Anything not recognised — stored verbatim for lossless round-trip.
    Raw(String),
}

impl fmt::Display for Item {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Item::Element(e) => write!(f, "{e}"),
            Item::Subckt(s) => write!(f, "{s}"),
            Item::Model(m) => write!(f, "{m}"),
            Item::Analysis(a) => write!(f, "{a}"),
            Item::Param(ps) => {
                write!(f, ".param")?;
                write_params(f, ps)
            }
            Item::Include(path) => write!(f, ".include \"{path}\""),
            Item::Lib { file, entry } => {
                write!(f, ".lib \"{file}\"")?;
                if let Some(e) = entry {
                    write!(f, " {e}")?;
                }
                Ok(())
            }
            Item::Global(nodes) => {
                write!(f, ".global")?;
                for n in nodes {
                    write!(f, " {n}")?;
                }
                Ok(())
            }
            Item::Options(ps) => {
                write!(f, ".options")?;
                write_params(f, ps)
            }
            Item::Save(vecs) => {
                write!(f, ".save")?;
                for v in vecs {
                    write!(f, " {v}")?;
                }
                Ok(())
            }
            Item::Comment(s) => write!(f, "* {s}"),
            Item::Raw(s) => write!(f, "{s}"),
        }
    }
}

// ---------------------------------------------------------------------------
// Top-level netlist
// ---------------------------------------------------------------------------

/// A complete SPICE netlist.
#[derive(Debug, Clone)]
pub struct Netlist {
    /// The title line (always the first line of a SPICE file).
    pub title: String,
    pub items: Vec<Item>,
}

impl Netlist {
    /// Parse a SPICE netlist from text.
    pub fn parse(input: &str) -> Result<Self, ParseError> {
        parse::parse(input)
    }

    /// Iterate over all top-level elements (not descending into subckts).
    pub fn elements(&self) -> impl Iterator<Item = &Element> {
        self.items.iter().filter_map(|i| {
            if let Item::Element(e) = i { Some(e) } else { None }
        })
    }

    /// Iterate over all top-level elements mutably.
    pub fn elements_mut(&mut self) -> impl Iterator<Item = &mut Element> {
        self.items.iter_mut().filter_map(|i| {
            if let Item::Element(e) = i { Some(e) } else { None }
        })
    }

    /// Lines to feed directly to [`ngspice::NgSpice::load_circuit`].
    ///
    /// Returns the netlist rendered as individual SPICE lines, terminated
    /// by `.end`.
    pub fn to_lines(&self) -> Vec<String> {
        let rendered = self.to_string();
        rendered.lines().map(str::to_owned).collect()
    }
}

impl fmt::Display for Netlist {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "{}", self.title)?;
        for item in &self.items {
            writeln!(f, "{item}")?;
        }
        write!(f, ".end")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    #[test]
    fn si_format_roundtrip() {
        assert_eq!(format_si(1000.0), "1k");
        assert_eq!(format_si(2500.0), "2.5k");
        assert_eq!(format_si(1e6), "1Meg");
        assert_eq!(format_si(1.5e-9), "1.5n");
        assert_eq!(format_si(100e-12), "100p");
        assert_eq!(format_si(0.0), "0");
        assert_eq!(format_si(-1e3), "-1k");
    }

    #[test]
    fn expr_display() {
        assert_eq!(Expr::Num(1000.0).to_string(), "1k");
        assert_eq!(Expr::Param("Rval".into()).to_string(), "Rval");
        assert_eq!(Expr::Brace("2*Rval".into()).to_string(), "{2*Rval}");
    }

    #[test]
    fn waveform_display_pulse() {
        let w = Waveform::Pulse {
            v1: Expr::Num(0.0),
            v2: Expr::Num(5.0),
            td: Some(Expr::Num(1e-9)),
            tr: None,
            tf: None,
            pw: Some(Expr::Num(5e-9)),
            per: None,
        };
        // td is present, tr and tf get "0" placeholders, pw is last
        assert_eq!(w.to_string(), "PULSE(0 5 1n 0 0 5n)");
    }

    #[test]
    fn waveform_display_pwl() {
        let w = Waveform::Pwl(vec![
            (Expr::Num(0.0), Expr::Num(0.0)),
            (Expr::Num(1e-9), Expr::Num(5.0)),
        ]);
        assert_eq!(w.to_string(), "PWL(0 0 1n 5)");
    }

    #[test]
    fn element_display_r() {
        let e = Element {
            name: "R1".into(),
            kind: ElementKind::R {
                pos: "a".into(),
                neg: "b".into(),
                value: Expr::Num(1000.0),
                params: vec![],
            },
        };
        assert_eq!(e.to_string(), "R1 a b 1k");
    }

    #[test]
    fn element_display_x() {
        let e = Element {
            name: "X1".into(),
            kind: ElementKind::X {
                ports: vec!["in".into(), "out".into(), "gnd".into()],
                subckt: "OPAMP".into(),
                params: vec![("gain".into(), Expr::Num(100.0))],
            },
        };
        assert_eq!(e.to_string(), "X1 in out gnd OPAMP gain=100");
    }

    #[test]
    fn netlist_display() {
        let n = Netlist {
            title: "Test circuit".into(),
            items: vec![
                Item::Element(Element {
                    name: "V1".into(),
                    kind: ElementKind::V {
                        pos: "vcc".into(),
                        neg: "0".into(),
                        source: Source { dc: Some(Expr::Num(5.0)), ..Default::default() },
                    },
                }),
                Item::Analysis(Analysis::Op),
            ],
        };
        let s = n.to_string();
        assert!(s.starts_with("Test circuit\n"));
        assert!(s.contains("V1 vcc 0 DC 5"));
        assert!(s.contains(".op"));
        assert!(s.ends_with(".end"));
    }

    #[test]
    fn parse_spice_number_basic() {
        use crate::parse::parse_spice_number;
        assert_abs_diff_eq!(parse_spice_number("1k").unwrap(),   1e3,  epsilon = 1e-9);
        assert_abs_diff_eq!(parse_spice_number("1Meg").unwrap(), 1e6,  epsilon = 1e-9);
        assert_abs_diff_eq!(parse_spice_number("1m").unwrap(),   1e-3, epsilon = 1e-12);
        assert_abs_diff_eq!(parse_spice_number("2.5n").unwrap(), 2.5e-9, epsilon = 1e-18);
        assert_abs_diff_eq!(parse_spice_number("1e3").unwrap(),  1e3,  epsilon = 1e-9);
        assert_abs_diff_eq!(parse_spice_number("100p").unwrap(), 1e-10, epsilon = 1e-20);
    }
}
