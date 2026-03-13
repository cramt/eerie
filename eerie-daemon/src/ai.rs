/// AI chat module — implements the agentic loop server-side.
/// All JSON is handled via facet-json (no hand-rolled helpers, no serde).
use std::collections::HashMap;

use facet_json::RawJson;
use eerie_rpc::{AiChatRequest, AiChatResponse, CircuitMutation};

// ── Anthropic response types ───────────────────────────────────────────────

#[derive(facet::Facet)]
struct AnthropicResponse {
    stop_reason: String,
    /// Raw JSON array of content blocks — kept verbatim to pass back in
    /// the assistant turn without any re-serialization loss.
    content: RawJson<'static>,
}

#[derive(facet::Facet)]
struct ContentBlock {
    #[facet(rename = "type")]
    kind: String,
    text: Option<String>,
    id: Option<String>,
    name: Option<String>,
    input: Option<RawJson<'static>>,
}

// ── Per-tool input types ───────────────────────────────────────────────────

#[derive(facet::Facet)]
struct UpdatePropertyInput {
    component_id: String,
    property: String,
    value: f64,
}

#[derive(facet::Facet)]
struct AddComponentInput {
    type_id: String,
    label: Option<String>,
    properties: Option<HashMap<String, f64>>,
}

#[derive(facet::Facet)]
struct RemoveComponentInput {
    component_id: String,
}

#[derive(facet::Facet)]
struct SetCircuitIntentInput {
    intent: String,
}

#[derive(facet::Facet)]
struct SetParameterInput {
    name: String,
    value: f64,
}

#[derive(facet::Facet)]
struct RemoveParameterInput {
    name: String,
}

// ── Message building types ─────────────────────────────────────────────────

/// A message with a plain-string content field (initial user/assistant turns).
#[derive(facet::Facet)]
struct TextMessage {
    role: String,
    content: String,
}

/// A message whose content is a raw JSON array (tool results or assistant content).
#[derive(facet::Facet)]
struct RawContentMessage {
    role: String,
    content: RawJson<'static>,
}

/// A single tool-result block inside a user turn.
#[derive(facet::Facet)]
struct ToolResultBlock {
    #[facet(rename = "type")]
    kind: String,
    tool_use_id: String,
    content: String,
}

/// A user turn consisting of one or more tool-result blocks.
#[derive(facet::Facet)]
struct ToolResultMessage {
    role: String,
    content: Vec<ToolResultBlock>,
}

// ── Request body type ──────────────────────────────────────────────────────

#[derive(facet::Facet)]
struct ChatRequestBody {
    model: String,
    max_tokens: u32,
    system: String,
    tools: RawJson<'static>,
    messages: RawJson<'static>,
}

// ── Anthropic tools definition (static JSON) ──────────────────────────────

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

// ── System prompt ──────────────────────────────────────────────────────────

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

// ── Circuit context from YAML ──────────────────────────────────────────────

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

// ── HTTP call to Anthropic ─────────────────────────────────────────────────

async fn chat_round(api_key: &str, messages_json: String, system: &str) -> Result<String, String> {
    let req_body = ChatRequestBody {
        model: "claude-opus-4-6".into(),
        max_tokens: 4096,
        system: system.to_owned(),
        tools: RawJson::new(TOOLS_JSON),
        messages: RawJson::from_owned(messages_json),
    };

    let body = facet_json::to_string(&req_body)
        .map_err(|e| format!("Failed to serialize request: {e}"))?;

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

// ── Tool execution ─────────────────────────────────────────────────────────

fn execute_tool(
    name: &str,
    input: &RawJson<'static>,
    spice_netlist: &str,
    mutations: &mut Vec<CircuitMutation>,
) -> String {
    let input_str = input.as_ref();
    match name {
        "update_component_property" => {
            match facet_json::from_str::<UpdatePropertyInput>(input_str) {
                Ok(i) => {
                    let result = format!("Updated {}.{} = {}", i.component_id, i.property, i.value);
                    mutations.push(CircuitMutation::UpdateProperty {
                        component_id: i.component_id,
                        property: i.property,
                        value: i.value,
                    });
                    result
                }
                Err(e) => format!("Failed to parse update_component_property input: {e}"),
            }
        }

        "add_component" => {
            match facet_json::from_str::<AddComponentInput>(input_str) {
                Ok(i) => {
                    let label_str = i.label.as_deref().map(|l| format!(" ({l})")).unwrap_or_default();
                    let result = format!("Added {} component{label_str}", i.type_id);
                    let properties = i.properties
                        .unwrap_or_default()
                        .into_iter()
                        .collect::<Vec<_>>();
                    mutations.push(CircuitMutation::AddComponent {
                        type_id: i.type_id,
                        label: i.label,
                        properties,
                    });
                    result
                }
                Err(e) => format!("Failed to parse add_component input: {e}"),
            }
        }

        "remove_component" => {
            match facet_json::from_str::<RemoveComponentInput>(input_str) {
                Ok(i) => {
                    let result = format!("Removed {}", i.component_id);
                    mutations.push(CircuitMutation::RemoveComponent { component_id: i.component_id });
                    result
                }
                Err(e) => format!("Failed to parse remove_component input: {e}"),
            }
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
            match facet_json::from_str::<SetCircuitIntentInput>(input_str) {
                Ok(i) => {
                    let intent = Some(i.intent.trim().to_owned())
                        .filter(|s| !s.is_empty());
                    let result = if intent.is_some() {
                        "Circuit intent updated".into()
                    } else {
                        "Circuit intent cleared".into()
                    };
                    mutations.push(CircuitMutation::SetIntent { intent });
                    result
                }
                Err(e) => format!("Failed to parse set_circuit_intent input: {e}"),
            }
        }

        "set_parameter" => {
            match facet_json::from_str::<SetParameterInput>(input_str) {
                Ok(i) => {
                    let result = format!("Parameter {} = {}", i.name, i.value);
                    mutations.push(CircuitMutation::SetParameter { name: i.name, value: i.value });
                    result
                }
                Err(e) => format!("Failed to parse set_parameter input: {e}"),
            }
        }

        "remove_parameter" => {
            match facet_json::from_str::<RemoveParameterInput>(input_str) {
                Ok(i) => {
                    let result = format!("Removed parameter {}", i.name);
                    mutations.push(CircuitMutation::RemoveParameter { name: i.name });
                    result
                }
                Err(e) => format!("Failed to parse remove_parameter input: {e}"),
            }
        }

        other => format!("Unknown tool: {other}"),
    }
}

// ── Main chat entry point ──────────────────────────────────────────────────

pub async fn run_chat(api_key: &str, request: AiChatRequest) -> Result<AiChatResponse, String> {
    let circuit_context = circuit_context_from_yaml(&request.circuit_yaml);
    let system = build_system_prompt(&circuit_context);
    let spice_netlist = request.spice_netlist.clone();

    // Serialize initial conversation history
    let mut messages: Vec<String> = request
        .messages
        .iter()
        .map(|m| {
            facet_json::to_string(&TextMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .expect("TextMessage serialization should never fail")
        })
        .collect();

    let mut mutations: Vec<CircuitMutation> = Vec::new();
    let mut final_text = String::new();

    for _iteration in 0..10 {
        let messages_json = format!("[{}]", messages.join(","));
        let response_text = chat_round(api_key, messages_json, &system).await?;

        let response = facet_json::from_str::<AnthropicResponse>(&response_text)
            .map_err(|e| format!("Failed to parse Anthropic response: {e}\nRaw: {response_text}"))?;

        if response.stop_reason == "end_turn" {
            let blocks = facet_json::from_str::<Vec<ContentBlock>>(response.content.as_ref())
                .unwrap_or_default();
            let text_parts: Vec<String> = blocks
                .into_iter()
                .filter(|b| b.kind == "text")
                .filter_map(|b| b.text)
                .collect();
            final_text = text_parts.join("\n").trim().to_string();
            break;
        }

        if response.stop_reason == "tool_use" {
            // Add the assistant turn with the raw content array
            let asst_msg = facet_json::to_string(&RawContentMessage {
                role: "assistant".into(),
                content: response.content.clone(),
            })
            .expect("RawContentMessage serialization should never fail");
            messages.push(asst_msg);

            // Parse content blocks to find tool_use entries
            let blocks = facet_json::from_str::<Vec<ContentBlock>>(response.content.as_ref())
                .map_err(|e| format!("Failed to parse content blocks: {e}"))?;

            let mut tool_results: Vec<ToolResultBlock> = Vec::new();
            for block in blocks {
                if block.kind == "tool_use" {
                    let tool_id = block.id.unwrap_or_else(|| "unknown".into());
                    let tool_name = block.name.unwrap_or_default();
                    let empty_input = RawJson::new("{}");
                    let input = block.input.as_ref().unwrap_or(&empty_input);

                    let result = execute_tool(&tool_name, input, &spice_netlist, &mut mutations);

                    tool_results.push(ToolResultBlock {
                        kind: "tool_result".into(),
                        tool_use_id: tool_id,
                        content: result,
                    });
                }
            }

            if tool_results.is_empty() {
                // No tool results — stop to avoid infinite loop
                break;
            }

            let user_msg = facet_json::to_string(&ToolResultMessage {
                role: "user".into(),
                content: tool_results,
            })
            .expect("ToolResultMessage serialization should never fail");
            messages.push(user_msg);
        } else {
            // Unknown stop reason — collect any text and stop
            let blocks = facet_json::from_str::<Vec<ContentBlock>>(response.content.as_ref())
                .unwrap_or_default();
            let text_parts: Vec<String> = blocks
                .into_iter()
                .filter(|b| b.kind == "text")
                .filter_map(|b| b.text)
                .collect();
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
