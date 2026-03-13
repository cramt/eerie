/// AI chat module — implements the agentic loop server-side.
/// No serde. All JSON is built/parsed with format!() and hand-rolled helpers.
use eerie_rpc::{AiChatRequest, AiChatResponse, CircuitMutation};

// ── Minimal JSON helpers ──────────────────────────────────────────────────

/// Escape a string value for embedding inside a JSON string literal.
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 4);
    for ch in s.chars() {
        match ch {
            '"' => out.push_str(r#"\""#),
            '\\' => out.push_str(r"\\"),
            '\n' => out.push_str(r"\n"),
            '\r' => out.push_str(r"\r"),
            '\t' => out.push_str(r"\t"),
            c if (c as u32) < 0x20 => {
                use std::fmt::Write as _;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

/// Extract a JSON string value by key from a flat JSON object.
/// Handles one level of nesting; sufficient for our usage.
fn extract_str(json: &str, key: &str) -> Option<String> {
    let needle = format!(r#""{key}":"#);
    let start = json.find(needle.as_str())? + needle.len();
    let rest = json[start..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let rest = &rest[1..];
    let mut result = String::new();
    let mut chars = rest.chars();
    loop {
        match chars.next()? {
            '"' => return Some(result),
            '\\' => match chars.next()? {
                '"' => result.push('"'),
                '\\' => result.push('\\'),
                'n' => result.push('\n'),
                'r' => result.push('\r'),
                't' => result.push('\t'),
                c => result.push(c),
            },
            c => result.push(c),
        }
    }
}

/// Extract a numeric value by key.
fn extract_num(json: &str, key: &str) -> Option<f64> {
    let needle = format!(r#""{key}":"#);
    let start = json.find(needle.as_str())? + needle.len();
    let rest = json[start..].trim_start();
    let end = rest
        .find(|c: char| !c.is_ascii_digit() && c != '-' && c != '.' && c != 'e' && c != 'E' && c != '+')
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

/// Extract the raw JSON representation (string, object, array, or primitive) of a key.
fn extract_raw_value(json: &str, key: &str) -> Option<String> {
    let needle = format!(r#""{key}":"#);
    let start = json.find(needle.as_str())? + needle.len();
    let rest = json[start..].trim_start();
    if rest.is_empty() {
        return None;
    }
    let first = rest.chars().next()?;
    match first {
        '"' => {
            // String value — read until unescaped closing quote
            let mut out = String::from("\"");
            let mut chars = rest[1..].chars();
            loop {
                match chars.next()? {
                    '"' => { out.push('"'); break; }
                    '\\' => {
                        out.push('\\');
                        if let Some(c) = chars.next() { out.push(c); }
                    }
                    c => out.push(c),
                }
            }
            Some(out)
        }
        '{' | '[' => {
            // Object or array — find matching closer
            let closer = if first == '{' { '}' } else { ']' };
            let mut depth = 0i32;
            let mut in_string = false;
            let mut escaped = false;
            let mut end = 0usize;
            for (i, c) in rest.char_indices() {
                if escaped { escaped = false; continue; }
                if in_string {
                    if c == '\\' { escaped = true; }
                    else if c == '"' { in_string = false; }
                    continue;
                }
                if c == '"' { in_string = true; continue; }
                if c == first || c == '[' || c == '{' { depth += 1; }
                else if c == closer || c == ']' || c == '}' {
                    depth -= 1;
                    if depth == 0 { end = i + c.len_utf8(); break; }
                }
            }
            if end > 0 { Some(rest[..end].to_string()) } else { None }
        }
        _ => {
            // Primitive (number, bool, null)
            let end = rest
                .find([',', '}', ']', '\n'])
                .unwrap_or(rest.len());
            Some(rest[..end].trim_end().to_string())
        }
    }
}

/// Split a JSON array of objects `[{...},{...}]` into individual object strings.
fn split_json_array_objects(array_json: &str) -> Vec<String> {
    let s = array_json.trim();
    if !s.starts_with('[') { return vec![]; }
    let inner = &s[1..];
    let mut objects = Vec::new();
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    let mut start: Option<usize> = None;

    for (i, c) in inner.char_indices() {
        if escaped { escaped = false; continue; }
        if in_string {
            if c == '\\' { escaped = true; }
            else if c == '"' { in_string = false; }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => {
                if depth == 0 { start = Some(i); }
                depth += 1;
            }
            '}' => {
                depth -= 1;
                if depth == 0 && let Some(s_idx) = start.take() {
                    objects.push(inner[s_idx..=i].to_string());
                }
            }
            '[' if depth > 0 => depth += 1,
            ']' if depth > 0 => depth -= 1,
            _ => {}
        }
    }
    objects
}

/// Parse `{"k": 1, "k2": 2.5, ...}` into Vec<(String, f64)>
fn extract_key_num_pairs(json_obj: &str) -> Vec<(String, f64)> {
    let mut pairs = Vec::new();
    let s = json_obj.trim();
    if !s.starts_with('{') { return pairs; }
    // Find all "key": number patterns
    let inner = &s[1..s.len().saturating_sub(1)];
    let mut remaining = inner;
    while let Some(q_start) = remaining.find('"') {
        let after_q = &remaining[q_start + 1..];
        // Find closing quote for key
        let mut key = String::new();
        let mut chars = after_q.chars();
        let mut key_end = 0usize;
        let mut escaped = false;
        for c in chars.by_ref() {
            key_end += c.len_utf8();
            if escaped { escaped = false; key.push(c); continue; }
            if c == '\\' { escaped = true; continue; }
            if c == '"' { break; }
            key.push(c);
        }
        // Skip past "key":
        let after_key = &after_q[key_end..];
        let after_colon = after_key.trim_start().strip_prefix(':').map(|s| s.trim_start());
        if let Some(val_str) = after_colon {
            let end = val_str
                .find([',', '}', '\n'])
                .unwrap_or(val_str.len());
            if let Ok(num) = val_str[..end].trim().parse::<f64>() {
                pairs.push((key, num));
            }
            remaining = &val_str[end..];
        } else {
            break;
        }
    }
    pairs
}

// ── Anthropic tools definition (static JSON) ─────────────────────────────

static TOOLS_JSON: &str = r#"[
  {
    "name": "update_component_property",
    "description": "Update a numeric property of a circuit component (e.g. change resistance, voltage, capacitance).",
    "input_schema": {
      "type": "object",
      "properties": {
        "component_id": {"type": "string", "description": "The label/ID of the component (e.g. R1, V1, C2)"},
        "property": {"type": "string", "description": "Property name (e.g. resistance, voltage, capacitance, inductance, current)"},
        "value": {"type": "number", "description": "New value in base SI units (ohms, volts, farads, henries, amps)"}
      },
      "required": ["component_id", "property", "value"]
    }
  },
  {
    "name": "add_component",
    "description": "Add a new component to the circuit. It will appear at the canvas center for the user to position.",
    "input_schema": {
      "type": "object",
      "properties": {
        "type_id": {"type": "string", "description": "Component type (e.g. resistor, capacitor, inductor, dc_voltage, dc_current, diode, npn, pnp, nmos, pmos, ground, opamp)"},
        "label": {"type": "string", "description": "Optional label (e.g. R3). Leave empty to auto-generate."},
        "properties": {"type": "object", "description": "Key-value pairs of numeric properties. E.g. {\"resistance\": 4700} or {\"voltage\": 12}", "additionalProperties": {"type": "number"}}
      },
      "required": ["type_id"]
    }
  },
  {
    "name": "remove_component",
    "description": "Remove a component from the circuit.",
    "input_schema": {
      "type": "object",
      "properties": {
        "component_id": {"type": "string", "description": "The label/ID of the component to remove (e.g. R1, V1)"}
      },
      "required": ["component_id"]
    }
  },
  {
    "name": "run_simulation",
    "description": "Run a DC operating point simulation and return the results.",
    "input_schema": {"type": "object", "properties": {}, "required": []}
  },
  {
    "name": "set_circuit_intent",
    "description": "Set or update the design intent description for this circuit.",
    "input_schema": {
      "type": "object",
      "properties": {
        "intent": {"type": "string", "description": "Human-readable description of the circuit's purpose, design goals, and constraints."}
      },
      "required": ["intent"]
    }
  },
  {
    "name": "set_parameter",
    "description": "Define or update a named circuit parameter.",
    "input_schema": {
      "type": "object",
      "properties": {
        "name": {"type": "string", "description": "Parameter name (e.g. R_load, cutoff_freq, supply_voltage)"},
        "value": {"type": "number", "description": "Numeric value in base SI units"}
      },
      "required": ["name", "value"]
    }
  },
  {
    "name": "remove_parameter",
    "description": "Remove a named circuit parameter.",
    "input_schema": {
      "type": "object",
      "properties": {
        "name": {"type": "string", "description": "Parameter name to remove"}
      },
      "required": ["name"]
    }
  }
]"#;

// ── System prompt ─────────────────────────────────────────────────────────

fn build_system_prompt(circuit_context: &str) -> String {
    format!(
        "You are an expert circuit design assistant embedded in Eerie, a SPICE-based circuit design tool.\n\
         \n\
         You help users design, analyze, and debug analog and digital circuits. You can:\n\
         - Explain circuit behavior and theory\n\
         - Suggest component values and circuit topologies\n\
         - Analyze simulation results and identify issues\n\
         - Modify the circuit by calling tools (add components, update values, etc.)\n\
         \n\
         Current circuit state:\n\
         {circuit_context}\n\
         \n\
         When modifying the circuit, prefer making targeted changes and explain what you changed and why.\n\
         After making changes, suggest running a simulation to verify the design.\n\
         Pin names for connections: resistor/capacitor/inductor use (a, b); voltage/current sources use (positive, negative); BJT uses (collector, base, emitter); MOSFET uses (drain, gate, source); diode uses (anode, cathode)."
    )
}

// ── Circuit context from YAML ─────────────────────────────────────────────

fn circuit_context_from_yaml(yaml: &str) -> String {
    use yaml_rust2::{Yaml, YamlLoader};
    let Ok(docs) = YamlLoader::load_from_str(yaml) else {
        return "(could not parse circuit YAML)".into();
    };
    let Some(doc) = docs.first() else {
        return "(empty circuit)".into();
    };

    let mut lines: Vec<String> = Vec::new();

    let name = doc["name"].as_str().unwrap_or("Untitled");
    lines.push(format!("Circuit: {name}"));

    if let Some(intent) = doc["intent"].as_str() {
        lines.push(String::new());
        lines.push("Intent:".into());
        for l in intent.trim().lines() {
            lines.push(format!("  {l}"));
        }
    }

    if let Yaml::Hash(params) = &doc["parameters"]
        && !params.is_empty()
    {
        lines.push(String::new());
        lines.push("Parameters:".into());
        for (k, v) in params {
            let key = k.as_str().unwrap_or("?");
            let val = match v {
                Yaml::Integer(i) => i.to_string(),
                Yaml::Real(r)    => r.clone(),
                Yaml::String(s)  => s.clone(),
                _ => format!("{v:?}"),
            };
            lines.push(format!("  {key} = {val}"));
        }
    }

    if let Yaml::Array(comps) = &doc["components"] {
        lines.push(String::new());
        lines.push("Components:".into());
        for comp in comps {
            let type_id = comp["type_id"].as_str().unwrap_or("?");
            let id      = comp["id"].as_str().unwrap_or("?");
            let label   = comp["label"].as_str().unwrap_or(id);

            let mut props: Vec<String> = Vec::new();
            if let Yaml::Hash(pmap) = &comp["properties"] {
                for (pk, pv) in pmap {
                    let key = pk.as_str().unwrap_or("?");
                    let val = match pv {
                        Yaml::Integer(i) => i.to_string(),
                        Yaml::Real(r)    => r.clone(),
                        Yaml::String(s)  => s.clone(),
                        Yaml::Hash(h) => {
                            let fk = Yaml::String("Float".into());
                            if let Some(Yaml::Integer(i)) = h.get(&fk) {
                                i.to_string()
                            } else if let Some(Yaml::Real(r)) = h.get(&fk) {
                                r.clone()
                            } else {
                                format!("{h:?}")
                            }
                        }
                        _ => continue,
                    };
                    props.push(format!("{key}={val}"));
                }
            }
            let props_str = if props.is_empty() { String::new() } else { format!(": {}", props.join(", ")) };
            lines.push(format!("  {label} ({type_id}){props_str}"));
        }
    }

    lines.join("\n")
}

// ── HTTP call to Anthropic ────────────────────────────────────────────────

async fn chat_round(api_key: &str, messages_json: &str, system: &str) -> Result<String, String> {
    let body = format!(
        r#"{{"model":"claude-opus-4-6","max_tokens":4096,"system":"{system_esc}","tools":{tools},"messages":{messages}}}"#,
        system_esc = json_escape(system),
        tools = TOOLS_JSON,
        messages = messages_json,
    );

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Anthropic API error {status}: {text}"));
    }

    Ok(text)
}

// ── Tool execution ────────────────────────────────────────────────────────

fn execute_tool(
    name: &str,
    input_json: &str,
    spice_netlist: &str,
    mutations: &mut Vec<CircuitMutation>,
) -> String {
    match name {
        "update_component_property" => {
            let component_id = extract_str(input_json, "component_id").unwrap_or_default();
            let property = extract_str(input_json, "property").unwrap_or_default();
            let value = extract_num(input_json, "value").unwrap_or(0.0);
            let result = format!("Updated {component_id}.{property} = {value}");
            mutations.push(CircuitMutation::UpdateProperty { component_id, property, value });
            result
        }

        "add_component" => {
            let type_id = extract_str(input_json, "type_id").unwrap_or_default();
            let label = extract_str(input_json, "label");
            let properties = extract_raw_value(input_json, "properties")
                .map(|v| extract_key_num_pairs(&v))
                .unwrap_or_default();
            let result = format!(
                "Added {} component{}",
                type_id,
                label.as_deref().map(|l| format!(" ({l})")).unwrap_or_default()
            );
            mutations.push(CircuitMutation::AddComponent { type_id, label, properties });
            result
        }

        "remove_component" => {
            let component_id = extract_str(input_json, "component_id").unwrap_or_default();
            let result = format!("Removed {component_id}");
            mutations.push(CircuitMutation::RemoveComponent { component_id });
            result
        }

        "run_simulation" => {
            if spice_netlist.is_empty() {
                return "No SPICE netlist provided for simulation".into();
            }
            match thevenin_types::parse::parse(spice_netlist) {
                Err(e) => format!("SPICE parse error: {e}"),
                Ok(netlist) => match thevenin::simulate_op(&netlist) {
                    Err(e) => format!("Simulation error: {e}"),
                    Ok(result) => {
                        let mut lines = Vec::new();
                        for plot in &result.plots {
                            for vec in &plot.vecs {
                                if vec.real.len() == 1 {
                                    lines.push(format!("  {} = {:.6}", vec.name, vec.real[0]));
                                } else if !vec.real.is_empty() {
                                    lines.push(format!(
                                        "  {} = [{:.4} .. {:.4}] ({} pts)",
                                        vec.name,
                                        vec.real[0],
                                        vec.real[vec.real.len() - 1],
                                        vec.real.len()
                                    ));
                                }
                            }
                        }
                        if lines.is_empty() {
                            "Simulation complete (no scalar results)".into()
                        } else {
                            format!("Simulation results:\n{}", lines.join("\n"))
                        }
                    }
                },
            }
        }

        "set_circuit_intent" => {
            let intent_str = extract_str(input_json, "intent");
            let intent = intent_str.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(String::from);
            let result = if intent.is_some() {
                "Circuit intent updated".into()
            } else {
                "Circuit intent cleared".into()
            };
            mutations.push(CircuitMutation::SetIntent { intent });
            result
        }

        "set_parameter" => {
            let name = extract_str(input_json, "name").unwrap_or_default();
            let value = extract_num(input_json, "value").unwrap_or(0.0);
            let result = format!("Parameter {name} = {value}");
            mutations.push(CircuitMutation::SetParameter { name, value });
            result
        }

        "remove_parameter" => {
            let name = extract_str(input_json, "name").unwrap_or_default();
            let result = format!("Removed parameter {name}");
            mutations.push(CircuitMutation::RemoveParameter { name });
            result
        }

        other => format!("Unknown tool: {other}"),
    }
}

// ── Main chat entry point ─────────────────────────────────────────────────

pub async fn run_chat(api_key: &str, request: AiChatRequest) -> Result<AiChatResponse, String> {
    let circuit_context = circuit_context_from_yaml(&request.circuit_yaml);
    let system = build_system_prompt(&circuit_context);
    let spice_netlist = request.spice_netlist.clone();

    // Build initial message JSON array from request history
    let mut message_jsons: Vec<String> = request
        .messages
        .iter()
        .map(|m| {
            format!(
                r#"{{"role":"{}","content":"{}"}}"#,
                json_escape(&m.role),
                json_escape(&m.content)
            )
        })
        .collect();

    let mut mutations: Vec<CircuitMutation> = Vec::new();
    let mut final_text = String::new();

    for _iteration in 0..10 {
        let messages_json = format!("[{}]", message_jsons.join(","));
        let response = chat_round(api_key, &messages_json, &system).await?;

        // Parse stop_reason
        let stop_reason = extract_str(&response, "stop_reason").unwrap_or_default();

        // Extract content array (raw JSON)
        let content_array_raw = extract_raw_value(&response, "content")
            .unwrap_or_else(|| "[]".into());

        if stop_reason == "end_turn" {
            // Collect all text blocks
            let content_objects = split_json_array_objects(&content_array_raw);
            let mut text_parts = Vec::new();
            for obj in &content_objects {
                if extract_str(obj, "type").as_deref() == Some("text")
                    && let Some(text) = extract_str(obj, "text")
                {
                    text_parts.push(text);
                }
            }
            final_text = text_parts.join("\n").trim().to_string();
            break;
        }

        if stop_reason == "tool_use" {
            // Add assistant message with raw content array
            message_jsons.push(format!(
                r#"{{"role":"assistant","content":{content_array_raw}}}"#
            ));

            // Process each tool_use block
            let content_objects = split_json_array_objects(&content_array_raw);
            let mut tool_result_parts = Vec::new();

            for obj in &content_objects {
                if extract_str(obj, "type").as_deref() == Some("tool_use") {
                    let tool_id = extract_str(obj, "id").unwrap_or_else(|| "unknown".into());
                    let tool_name = extract_str(obj, "name").unwrap_or_default();
                    let input_raw = extract_raw_value(obj, "input").unwrap_or_else(|| "{}".into());

                    let result = execute_tool(&tool_name, &input_raw, &spice_netlist, &mut mutations);

                    tool_result_parts.push(format!(
                        r#"{{"type":"tool_result","tool_use_id":"{tool_id_esc}","content":"{result_esc}"}}"#,
                        tool_id_esc = json_escape(&tool_id),
                        result_esc = json_escape(&result),
                    ));
                }
            }

            if tool_result_parts.is_empty() {
                // No tool results — shouldn't happen, but stop to avoid infinite loop
                break;
            }

            // Add user message with tool results
            message_jsons.push(format!(
                r#"{{"role":"user","content":[{}]}}"#,
                tool_result_parts.join(",")
            ));
        } else {
            // Unknown stop reason — collect any text and stop
            let content_objects = split_json_array_objects(&content_array_raw);
            let mut text_parts = Vec::new();
            for obj in &content_objects {
                if extract_str(obj, "type").as_deref() == Some("text")
                    && let Some(text) = extract_str(obj, "text")
                {
                    text_parts.push(text);
                }
            }
            final_text = text_parts.join("\n").trim().to_string();
            break;
        }
    }

    if final_text.is_empty() {
        final_text = "(no response)".into();
    }

    Ok(AiChatResponse {
        message: final_text,
        mutations,
    })
}
