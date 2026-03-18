use crate::ai_provider::AiProvider;
use crate::error::DaemonError;
use eerie_rpc::{
    AiChatRequest, AiChatResponse, AiEditCircuitRequest, AiEditCircuitResponse, Bounds2d,
    Capabilities, ComponentDef, CreateFolderRequest, DeleteRequest, EerieService, FileContent,
    FileOpenRequest, FileSaveRequest, FileSaveResult, GraphicsElement, ListProjectRequest,
    PinLocation, ProjectDir, ProjectListing, PropertyDef, RenameRequest, SymbolGraphics, TreeEntry,
};
use std::{path::PathBuf, sync::Arc};
use thevenin_types::{Netlist, SimResult};

#[derive(Clone)]
pub struct DaemonService {
    pub project_dir: PathBuf,
    pub ai: Arc<dyn AiProvider + Send + Sync>,
}

impl DaemonService {
    fn file_open_inner(&self, req: &FileOpenRequest) -> Result<FileContent, DaemonError> {
        let path = std::path::Path::new(&req.path);
        log::info!("file_open: {}", path.display());
        let content = std::fs::read_to_string(path)
            .map_err(|source| DaemonError::FileIo { operation: "read", path: path.into(), source })?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| req.path.clone());
        log::debug!("file_open: read {} bytes from {}", content.len(), path.display());
        Ok(FileContent { name, content })
    }

    fn file_save_inner(&self, req: &FileSaveRequest) -> Result<FileSaveResult, DaemonError> {
        let path = std::path::Path::new(&req.path);
        log::info!("file_save: {} ({} bytes)", path.display(), req.content.len());
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|source| DaemonError::CreateDir { path: parent.into(), source })?;
        }
        std::fs::write(path, &req.content)
            .map_err(|source| DaemonError::FileIo { operation: "write", path: path.into(), source })?;
        Ok(FileSaveResult { path: req.path.clone() })
    }

    fn list_project_inner(&self, req: &ListProjectRequest) -> Result<ProjectListing, DaemonError> {
        let dir = std::path::Path::new(&req.path);
        log::info!("list_project: {}", dir.display());
        let manifest_yaml = std::fs::read_to_string(dir.join("eerie.yaml"))
            .map_err(|source| DaemonError::NotAProject { source })?;
        let mut circuits = Vec::new();
        let mut files = Vec::new();
        for entry in std::fs::read_dir(dir)
            .map_err(|source| DaemonError::ReadDir { source })?
            .filter_map(|e| e.ok())
        {
            if entry.file_type().map_or(true, |ft| ft.is_dir()) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "eerie.yaml" {
                continue;
            }
            if name.ends_with(".eerie") {
                circuits.push(name);
            } else {
                files.push(name);
            }
        }
        circuits.sort();
        files.sort();
        let tree = build_tree(dir, "");
        log::debug!("list_project: {} circuits, {} files, {} tree entries",
            circuits.len(), files.len(), tree.len());
        Ok(ProjectListing { manifest_yaml, circuits, files, tree })
    }

    fn simulate_inner<E: std::fmt::Display>(&self, analysis: &str, f: impl FnOnce(&Netlist) -> Result<SimResult, E>, netlist: &Netlist) -> Result<SimResult, DaemonError> {
        log::info!("simulate_{}: {} items", analysis, netlist.items.len());
        let t0 = std::time::Instant::now();
        let result = f(netlist)
            .map_err(|e| DaemonError::Simulation(e.to_string()))?;
        log::info!("simulate_{}: completed in {:.1}ms, {} plots",
            analysis, t0.elapsed().as_secs_f64() * 1000.0, result.plots.len());
        Ok(result)
    }
}

impl EerieService for DaemonService {
    async fn get_capabilities(&self) -> Result<Capabilities, String> {
        Ok(Capabilities { file_io: true, ai_chat: true, ai_edit: true })
    }

    async fn get_project_dir(&self) -> Result<ProjectDir, String> {
        Ok(ProjectDir {
            path: self.project_dir.to_string_lossy().into_owned(),
        })
    }

    async fn file_open(&self, req: FileOpenRequest) -> Result<FileContent, String> {
        self.file_open_inner(&req).map_err(Into::into)
    }

    async fn file_save(&self, req: FileSaveRequest) -> Result<FileSaveResult, String> {
        self.file_save_inner(&req).map_err(Into::into)
    }

    async fn list_project(&self, req: ListProjectRequest) -> Result<ProjectListing, String> {
        self.list_project_inner(&req).map_err(Into::into)
    }

    async fn rename_path(&self, req: RenameRequest) -> Result<bool, String> {
        log::info!("rename_path: {} -> {}", req.from, req.to);
        std::fs::rename(&req.from, &req.to)
            .map(|_| true)
            .map_err(|source| DaemonError::Rename { source }.to_string())
    }

    async fn delete_path(&self, req: DeleteRequest) -> Result<bool, String> {
        let path = std::path::Path::new(&req.path);
        log::info!("delete_path: {}", path.display());
        if path.is_dir() {
            std::fs::remove_dir_all(path)
        } else {
            std::fs::remove_file(path)
        }
        .map(|_| true)
        .map_err(|source| DaemonError::Delete { source }.to_string())
    }

    async fn create_folder(&self, req: CreateFolderRequest) -> Result<bool, String> {
        log::info!("create_folder: {}", req.path);
        std::fs::create_dir_all(&req.path)
            .map(|_| true)
            .map_err(|source| DaemonError::Mkdir { source }.to_string())
    }

    async fn ai_chat(&self, req: AiChatRequest) -> Result<AiChatResponse, String> {
        log::info!("ai_chat: message={} chars, session_id={:?}",
            req.message.len(), req.session_id);

        let mut cmd = tokio::process::Command::new("claude");
        cmd.arg("-p")
            .arg(&req.message)
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .env_remove("CLAUDECODE") // allow nesting inside a claude session
            .current_dir(&self.project_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        if let Some(ref sid) = req.session_id {
            cmd.arg("--resume").arg(sid);
        }
        let output = cmd
            .output()
            .await
            .map_err(|source| DaemonError::AiSpawn { source }.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // NDJSON: scan lines for the "result" event (also extract session_id)
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else { continue };
            if val.get("type").and_then(|t| t.as_str()) == Some("result") {
                let text = val.get("result")
                    .and_then(|r| r.as_str())
                    .unwrap_or("")
                    .to_string();
                let session_id = val.get("session_id")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                log::info!("ai_chat: got result ({} chars)", text.len());
                return Ok(AiChatResponse { text, session_id });
            }
        }

        let stderr_snippet = if stderr.trim().is_empty() {
            String::new()
        } else {
            format!(": {}", stderr.trim())
        };
        Err(DaemonError::AiNoResult(format!(
            "claude exited with status {:?} but produced no result event{stderr_snippet}",
            output.status.code()
        )).to_string())
    }

    async fn ai_edit_circuit(&self, req: AiEditCircuitRequest) -> Result<AiEditCircuitResponse, String> {
        log::info!(
            "[ai_edit] request: instruction={:?}, focused={:?}, yaml={} bytes",
            req.instruction,
            req.focused_component_id,
            req.circuit_yaml.len(),
        );

        // Build a list of known component type IDs for the system prompt
        let defs = self.list_component_defs().await.unwrap_or_default();
        let type_ids: Vec<&str> = defs.iter().map(|d| d.id.as_str()).collect();
        let type_id_list = if type_ids.is_empty() {
            "  (none — no component definitions found in workspace)".to_string()
        } else {
            type_ids.iter().map(|id| format!("  - {id}")).collect::<Vec<_>>().join("\n")
        };

        let system = format!(
r#"You are an expert circuit design assistant for the Eerie circuit tool.

Your task: modify a circuit described in YAML format according to the user's instruction,
then output ONLY the updated YAML — nothing else, no explanation, no prose.

## YAML format

The circuit YAML has this structure:
```yaml
name: <circuit name>
components:
  - id: R1
    type_id: resistor
    position: {{x: 0, y: 0}}
    rotation: 0       # degrees, 0/90/180/270
    flip_x: false
    properties:
      value: 1000.0   # property values are plain numbers or strings
nets:
  - id: net1
    segments:
      - start: {{x: 0, y: 0}}
        end: {{x: 10, y: 0}}
    pins:
      - component_id: R1
        pin_id: p     # pin IDs depend on component type
    labels: []
```

## Component type IDs available in this workspace:
{type_id_list}

## Rules
1. Keep all existing component IDs intact unless the user asks to remove them.
2. Use UUID v4 format for new component IDs (e.g. "550e8400-e29b-41d4-a716-446655440000").
3. Property values are plain numbers (not wrapped in {{Float: ...}}).
4. Positions use integer grid coordinates; the grid pitch is 10 units.
5. Output ONLY the YAML — no markdown code fences, no explanation.
6. Preserve components and nets you did not modify exactly as-is."#
        );

        let mut user = format!(
            "Circuit:\n```yaml\n{}\n```\n\nInstruction: {}",
            req.circuit_yaml.trim(),
            req.instruction.trim()
        );

        if let Some(ref comp_id) = req.focused_component_id {
            if let Some(ctx) = extract_component_context(&req.circuit_yaml, comp_id) {
                user.push_str(&format!("\n\nFocused component ({comp_id}):\n{ctx}"));
            }
        }

        log::info!(
            "[ai_edit] sending to AI: system={} bytes, user={} bytes",
            system.len(),
            user.len(),
        );
        let t0 = std::time::Instant::now();
        let response = self.ai.complete(&system, &user).await?;
        log::info!(
            "[ai_edit] AI responded in {:.1}s, response={} bytes",
            t0.elapsed().as_secs_f64(),
            response.len(),
        );

        let yaml = extract_yaml_block(&response);
        log::info!("[ai_edit] extracted yaml block: {} bytes", yaml.len());
        validate_circuit_yaml(&yaml)?;
        log::info!("[ai_edit] yaml validated OK");

        Ok(AiEditCircuitResponse { circuit_yaml: yaml })
    }

    async fn simulate_op(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("op", thevenin::simulate_op, &netlist).map_err(Into::into)
    }

    async fn simulate_dc(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("dc", thevenin::simulate_dc, &netlist).map_err(Into::into)
    }

    async fn simulate_ac(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("ac", thevenin::simulate_ac, &netlist).map_err(Into::into)
    }

    async fn simulate_tran(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("tran", thevenin::simulate_tran, &netlist).map_err(Into::into)
    }

    async fn simulate_noise(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("noise", thevenin::simulate_noise, &netlist).map_err(Into::into)
    }

    async fn simulate_tf(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("tf", thevenin::simulate_tf, &netlist).map_err(Into::into)
    }

    async fn simulate_sens(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("sens", thevenin::simulate_sens, &netlist).map_err(Into::into)
    }

    async fn simulate_pz(&self, netlist: Netlist) -> Result<SimResult, String> {
        self.simulate_inner("pz", thevenin::simulate_pz, &netlist).map_err(Into::into)
    }

    async fn list_component_defs(&self) -> Result<Vec<ComponentDef>, String> {
        let components_dir = self.project_dir.join("components");
        log::info!("list_component_defs: scanning {}", components_dir.display());
        if !components_dir.exists() {
            log::debug!("list_component_defs: components/ directory does not exist");
            return Ok(vec![]);
        }
        let mut defs = Vec::new();
        scan_yaml_dir(&components_dir, &mut defs);
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        log::info!("list_component_defs: found {} definitions", defs.len());
        Ok(defs)
    }
}

/// Recursively build a flat, depth-first list of tree entries.
/// Parent directories are emitted before their children.
fn build_tree(dir: &std::path::Path, prefix: &str) -> Vec<TreeEntry> {
    let Ok(read) = std::fs::read_dir(dir) else { return vec![] };
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    let mut out = Vec::new();
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') { continue; }
        // At root, skip the manifest itself
        if prefix.is_empty() && name == "eerie.yaml" { continue; }
        let path = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        let ft = entry.file_type();
        if ft.map_or(false, |ft| ft.is_dir()) {
            out.push(TreeEntry { path: path.clone(), name: name.clone(), kind: "dir".into() });
            out.extend(build_tree(&entry.path(), &path));
        } else {
            let kind = if name.ends_with(".eerie") { "circuit" } else { "file" };
            out.push(TreeEntry { path, name, kind: kind.into() });
        }
    }
    out
}

fn scan_yaml_dir(dir: &std::path::Path, out: &mut Vec<ComponentDef>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_yaml_dir(&path, out);
        } else if path.extension().map_or(false, |e| e == "yaml") {
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Some(def) = parse_component_def(&text) {
                    out.push(def);
                }
            }
        }
    }
}

fn parse_component_def(yaml_str: &str) -> Option<ComponentDef> {
    use yaml_rust2::YamlLoader;
    let docs = YamlLoader::load_from_str(yaml_str).ok()?;
    let doc = docs.first()?;

    // Skip files that don't look like component defs (must have id + name)
    let id = doc["id"].as_str()?.to_string();
    let name = doc["name"].as_str()?.to_string();
    let description = doc["description"].as_str().unwrap_or("").to_string();
    let category = doc["category"].as_str().unwrap_or("").to_string();
    let subcategory = doc["subcategory"].as_str().map(String::from);
    let keywords = doc["keywords"]
        .as_vec()
        .map(|v| v.iter().filter_map(|k| k.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let properties = doc["properties"]
        .as_vec()
        .map(|v| v.iter().filter_map(parse_property_def).collect())
        .unwrap_or_default();
    let symbol = parse_symbol(&doc["symbol"]);
    let pins = doc["pins"]
        .as_vec()
        .map(|v| v.iter().filter_map(parse_pin_location).collect())
        .unwrap_or_default();

    Some(ComponentDef { id, name, description, category, subcategory, keywords, properties, symbol, pins })
}

fn parse_property_def(yaml: &yaml_rust2::Yaml) -> Option<PropertyDef> {
    let id = yaml["id"].as_str()?.to_string();
    let label = yaml["label"].as_str().unwrap_or(&id).to_string();
    let unit = yaml["unit"].as_str().map(String::from);
    let default = extract_default_f64(&yaml["default"]).unwrap_or(0.0);
    Some(PropertyDef { id, label, unit, default })
}

/// Extract a numeric default from `{ Float: 1.0 }` or a bare number.
fn extract_default_f64(yaml: &yaml_rust2::Yaml) -> Option<f64> {
    if let Some(f) = yaml.as_f64() {
        return Some(f);
    }
    if let yaml_rust2::Yaml::Hash(h) = yaml {
        for (_k, v) in h {
            if let Some(f) = v.as_f64() {
                return Some(f);
            }
        }
    }
    None
}

fn parse_symbol(yaml: &yaml_rust2::Yaml) -> Option<SymbolGraphics> {
    if yaml.is_badvalue() || yaml.is_null() {
        return None;
    }
    let bounds = {
        let b = &yaml["bounds"];
        Bounds2d {
            x: b["x"].as_f64().unwrap_or(0.0),
            y: b["y"].as_f64().unwrap_or(0.0),
            width: b["width"].as_f64().unwrap_or(0.0),
            height: b["height"].as_f64().unwrap_or(0.0),
        }
    };
    let graphics = yaml["graphics"]
        .as_vec()
        .map(|v| v.iter().filter_map(parse_graphics_element).collect())
        .unwrap_or_default();
    Some(SymbolGraphics { bounds, graphics })
}

fn parse_graphics_element(yaml: &yaml_rust2::Yaml) -> Option<GraphicsElement> {
    let kind = yaml["kind"].as_str()?.to_string();
    Some(GraphicsElement {
        kind,
        x1: yaml["x1"].as_f64(),
        y1: yaml["y1"].as_f64(),
        x2: yaml["x2"].as_f64(),
        y2: yaml["y2"].as_f64(),
        cx: yaml["cx"].as_f64(),
        cy: yaml["cy"].as_f64(),
        r: yaml["r"].as_f64(),
        start_angle: yaml["start_angle"].as_f64(),
        end_angle: yaml["end_angle"].as_f64(),
        x: yaml["x"].as_f64(),
        y: yaml["y"].as_f64(),
        width: yaml["width"].as_f64(),
        height: yaml["height"].as_f64(),
        points: yaml["points"]
            .as_vec()
            .map(|v| v.iter().filter_map(|p| p.as_f64()).collect())
            .unwrap_or_default(),
        filled: yaml["filled"].as_bool(),
        stroke_width: yaml["stroke_width"].as_f64(),
        text: yaml["text"].as_str().map(String::from),
        font_size: yaml["font_size"].as_f64(),
    })
}

fn parse_pin_location(yaml: &yaml_rust2::Yaml) -> Option<PinLocation> {
    let id = yaml["id"].as_str()?.to_string();
    let name = yaml["name"].as_str().unwrap_or(&id).to_string();
    let pos = &yaml["position"];
    let x = pos["x"].as_f64().unwrap_or(0.0);
    let y = pos["y"].as_f64().unwrap_or(0.0);
    Some(PinLocation { id, name, x, y })
}

/// Extract the first ```yaml ... ``` fenced block from a string.
/// Falls back to the trimmed string itself if no fence is found.
fn extract_yaml_block(text: &str) -> String {
    // Look for ```yaml\n...\n``` or ```\n...\n```
    for fence_start in ["```yaml\n", "```\n"] {
        if let Some(start) = text.find(fence_start) {
            let after = &text[start + fence_start.len()..];
            if let Some(end) = after.find("```") {
                return after[..end].trim().to_string();
            }
        }
    }
    text.trim().to_string()
}

/// Validate that a YAML string looks like a circuit (has `components` and `nets` keys).
fn validate_circuit_yaml(yaml: &str) -> Result<(), String> {
    use yaml_rust2::YamlLoader;
    let docs = YamlLoader::load_from_str(yaml)
        .map_err(|e| DaemonError::AiYamlParse(e.to_string()).to_string())?;
    let doc = docs.first().ok_or_else(|| DaemonError::AiValidation("AI returned empty YAML".into()).to_string())?;
    if doc["components"].is_badvalue() {
        return Err(DaemonError::AiValidation("AI response is missing 'components' key".into()).to_string());
    }
    if doc["nets"].is_badvalue() {
        return Err(DaemonError::AiValidation("AI response is missing 'nets' key".into()).to_string());
    }
    Ok(())
}

/// Extract YAML text for a single component from the circuit YAML by its ID.
fn extract_component_context(circuit_yaml: &str, comp_id: &str) -> Option<String> {
    use yaml_rust2::YamlLoader;
    use yaml_rust2::YamlEmitter;
    let docs = YamlLoader::load_from_str(circuit_yaml).ok()?;
    let doc = docs.first()?;
    let components = doc["components"].as_vec()?;
    for comp in components {
        if comp["id"].as_str() == Some(comp_id) {
            let mut out = String::new();
            let mut emitter = YamlEmitter::new(&mut out);
            emitter.dump(comp).ok()?;
            return Some(out);
        }
    }
    None
}
