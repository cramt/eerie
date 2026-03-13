use eerie_rpc::{
    AiChatRequest, AiChatResponse, Bounds2d, Capabilities, ComponentDef, EerieService, FileContent,
    FileOpenRequest, FileSaveRequest, FileSaveResult, GraphicsElement, ListProjectRequest,
    PinLocation, ProjectDir, ProjectListing, PropertyDef, SymbolGraphics,
};
use std::path::PathBuf;
use thevenin_types::{Netlist, SimResult};

#[derive(Clone)]
pub struct DaemonService {
    pub project_dir: PathBuf,
    pub port: u16,
}

impl EerieService for DaemonService {
    async fn get_capabilities(&self) -> Result<Capabilities, String> {
        Ok(Capabilities {
            file_io: true,
            anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
        })
    }

    async fn get_project_dir(&self) -> Result<ProjectDir, String> {
        Ok(ProjectDir {
            path: self.project_dir.to_string_lossy().into_owned(),
        })
    }

    async fn file_open(&self, req: FileOpenRequest) -> Result<FileContent, String> {
        let path = std::path::Path::new(&req.path);
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| req.path.clone());
        Ok(FileContent { name, content })
    }

    async fn file_save(&self, req: FileSaveRequest) -> Result<FileSaveResult, String> {
        let path = std::path::Path::new(&req.path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directories: {e}"))?;
        }
        std::fs::write(path, &req.content)
            .map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
        Ok(FileSaveResult {
            path: req.path,
        })
    }

    async fn list_project(&self, req: ListProjectRequest) -> Result<ProjectListing, String> {
        let dir = std::path::Path::new(&req.path);
        let manifest_yaml = std::fs::read_to_string(dir.join("eerie.yaml"))
            .map_err(|e| format!("not an eerie project (no eerie.yaml): {e}"))?;
        let mut circuits = Vec::new();
        let mut files = Vec::new();
        for entry in std::fs::read_dir(dir)
            .map_err(|e| format!("cannot read directory: {e}"))?
            .filter_map(|e| e.ok())
        {
            // Skip directories
            if entry.file_type().map_or(true, |ft| ft.is_dir()) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".eerie") {
                circuits.push(name);
            } else if name != "eerie.yaml" {
                files.push(name);
            }
        }
        circuits.sort();
        files.sort();
        Ok(ProjectListing {
            manifest_yaml,
            circuits,
            files,
        })
    }

    async fn simulate_op(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_op(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_dc(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_dc(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_ac(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_ac(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_tran(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_tran(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_noise(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_noise(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_tf(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_tf(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_sens(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_sens(&netlist).map_err(|e| e.to_string())
    }

    async fn simulate_pz(&self, netlist: Netlist) -> Result<SimResult, String> {
        thevenin::simulate_pz(&netlist).map_err(|e| e.to_string())
    }

    async fn ai_chat(&self, req: AiChatRequest) -> Result<AiChatResponse, String> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| "ANTHROPIC_API_KEY not set".to_string())?;
        let mcp_url = format!("http://127.0.0.1:{}/mcp", self.port);
        crate::ai::run_chat(&api_key, req, &mcp_url).await
    }

    async fn list_component_defs(&self) -> Result<Vec<ComponentDef>, String> {
        let workspace = std::env::var("EERIE_WORKSPACE")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
        let components_dir = workspace.join("components");
        if !components_dir.exists() {
            return Ok(vec![]);
        }
        let mut defs = Vec::new();
        scan_yaml_dir(&components_dir, &mut defs);
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(defs)
    }
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
