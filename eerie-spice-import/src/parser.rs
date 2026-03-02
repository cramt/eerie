//! SPICE netlist parser — handles .MODEL and .SUBCKT statements.
//!
//! Supports:
//! - Line continuations (lines starting with `+`)
//! - Comment lines (starting with `*`)
//! - Inline comments (`$` or `;`)
//! - Case-insensitive keywords
//! - Parenthesised parameter lists: `.MODEL name TYPE (key=val ...)`
//! - Bare parameter lists:        `.MODEL name TYPE key=val ...`
//! - `.SUBCKT name pin1 pin2 ... [PARAMS: ...]`

use anyhow::Result;

/// A parsed `.MODEL` statement.
#[derive(Debug, Clone)]
pub struct SpiceModel {
    pub name: String,
    pub model_type: ModelType,
    /// Raw key=value pairs from the parameter list.
    pub params: Vec<(String, String)>,
}

/// A parsed `.SUBCKT` definition.
#[derive(Debug, Clone)]
pub struct SpiceSubckt {
    pub name: String,
    /// Port names in order (before any PARAMS: keyword).
    pub ports: Vec<String>,
    /// Lines of the subcircuit body (for reference; not fully parsed).
    pub body: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelType {
    /// Diode
    D,
    /// NPN BJT
    Npn,
    /// PNP BJT
    Pnp,
    /// N-channel MOSFET
    Nmos,
    /// P-channel MOSFET
    Pmos,
    /// N-channel JFET
    Njf,
    /// P-channel JFET
    Pjf,
    /// Unknown/unsupported type
    Other(String),
}

impl ModelType {
    fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "D" => ModelType::D,
            "NPN" => ModelType::Npn,
            "PNP" => ModelType::Pnp,
            "NMOS" => ModelType::Nmos,
            "PMOS" => ModelType::Pmos,
            "NJF" => ModelType::Njf,
            "PJF" => ModelType::Pjf,
            other => ModelType::Other(other.to_string()),
        }
    }
}

#[derive(Debug, Default)]
pub struct ParsedFile {
    pub models: Vec<SpiceModel>,
    pub subckts: Vec<SpiceSubckt>,
}

/// Parse a SPICE library file from a string.
pub fn parse(source: &str) -> Result<ParsedFile> {
    let logical_lines = join_continuations(source);
    let mut out = ParsedFile::default();

    let mut i = 0;
    while i < logical_lines.len() {
        let line = logical_lines[i].trim();

        // Skip blank / comment lines
        if line.is_empty() || line.starts_with('*') {
            i += 1;
            continue;
        }

        let stripped = strip_inline_comment(line);
        let upper = stripped.to_uppercase();

        if upper.starts_with(".MODEL") {
            if let Some(m) = parse_model(&stripped) {
                out.models.push(m);
            }
            i += 1;
        } else if upper.starts_with(".SUBCKT") {
            // Collect lines until .ENDS
            let mut body = Vec::new();
            let header = stripped.to_string();
            i += 1;
            while i < logical_lines.len() {
                let bl = logical_lines[i].trim();
                let bu = bl.to_uppercase();
                if bu.starts_with(".ENDS") {
                    i += 1;
                    break;
                }
                if !bl.is_empty() && !bl.starts_with('*') {
                    body.push(strip_inline_comment(bl).to_string());
                }
                i += 1;
            }
            if let Some(s) = parse_subckt(&header, body) {
                out.subckts.push(s);
            }
        } else {
            i += 1;
        }
    }

    Ok(out)
}

/// Join continuation lines (those starting with `+`) into a single logical line.
fn join_continuations(source: &str) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for raw in source.lines() {
        let trimmed = raw.trim_start();
        if trimmed.starts_with('+') {
            // Append to previous line, replacing the `+` with a space
            if let Some(last) = result.last_mut() {
                last.push(' ');
                last.push_str(trimmed[1..].trim_start());
            } else {
                result.push(trimmed[1..].trim_start().to_string());
            }
        } else {
            result.push(raw.to_string());
        }
    }
    result
}

/// Strip inline comments introduced by `$` or `;`.
fn strip_inline_comment(line: &str) -> &str {
    // Find first `$` or `;` not inside parentheses
    let mut depth = 0i32;
    let bytes = line.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'(' => depth += 1,
            b')' => depth -= 1,
            b'$' | b';' if depth == 0 => return line[..i].trim_end(),
            _ => {}
        }
    }
    line.trim_end()
}

/// Parse: `.MODEL <name> <type> [(<params>)|<params>]`
fn parse_model(line: &str) -> Option<SpiceModel> {
    // Split tokens, but keep the param block (parenthesized or bare) together
    let mut parts = line.split_whitespace();
    parts.next()?; // .MODEL
    let name = parts.next()?.to_string();
    let type_str = parts.next()?;
    let model_type = ModelType::from_str(type_str);

    // Reconstruct the rest for param parsing
    let rest = line[line.to_uppercase().find(type_str.to_uppercase().as_str())
        .unwrap_or(0) + type_str.len()..]
        .trim();

    let params = parse_params(rest);

    Some(SpiceModel {
        name,
        model_type,
        params,
    })
}

/// Parse key=value parameters. Handles both `(key=val key=val)` and bare `key=val key=val`.
fn parse_params(s: &str) -> Vec<(String, String)> {
    let inner = if s.starts_with('(') && s.contains(')') {
        let start = 1;
        let end = s.rfind(')').unwrap_or(s.len());
        &s[start..end]
    } else {
        s
    };

    inner
        .split_whitespace()
        .filter_map(|tok| {
            let eq = tok.find('=')?;
            let key = tok[..eq].to_string();
            let val = tok[eq + 1..].to_string();
            Some((key, val))
        })
        .collect()
}

/// Parse a `.SUBCKT` header line + body lines.
fn parse_subckt(header: &str, body: Vec<String>) -> Option<SpiceSubckt> {
    let mut tokens = header.split_whitespace();
    tokens.next()?; // .SUBCKT
    let name = tokens.next()?.to_string();

    // Ports are tokens until we hit PARAMS: or end of line
    let mut ports = Vec::new();
    for tok in tokens {
        if tok.to_uppercase().starts_with("PARAMS") {
            break;
        }
        ports.push(tok.to_string());
    }

    Some(SpiceSubckt { name, ports, body })
}
