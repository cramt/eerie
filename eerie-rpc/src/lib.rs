pub use thevenin_types::{Netlist, SimResult};

/// A single property definition for a component, parsed from its YAML file.
#[derive(facet::Facet, Clone, Debug)]
pub struct PropertyDef {
    pub id: String,
    pub label: String,
    pub unit: Option<String>,
    /// Default value in base SI units.
    pub default: f64,
}

/// A single graphics primitive in a component symbol.
/// Uses a flat struct — only the fields relevant to each `kind` are non-null.
///
/// Supported kinds: `"line"`, `"circle"`, `"arc"`, `"rect"`, `"polyline"`, `"text"`
#[derive(facet::Facet, Clone, Debug)]
pub struct GraphicsElement {
    pub kind: String,
    // line: (x1,y1)→(x2,y2)
    pub x1: Option<f64>,
    pub y1: Option<f64>,
    pub x2: Option<f64>,
    pub y2: Option<f64>,
    // circle / arc: center + radius
    pub cx: Option<f64>,
    pub cy: Option<f64>,
    pub r: Option<f64>,
    // arc: sweep angles in degrees (standard math: 0=right, CCW positive)
    pub start_angle: Option<f64>,
    pub end_angle: Option<f64>,
    // rect / bounds: top-left corner
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    // polyline: flat interleaved [x0,y0, x1,y1, ...]
    pub points: Vec<f64>,
    pub filled: Option<bool>,
    // shared
    pub stroke_width: Option<f64>,
    // text
    pub text: Option<String>,
    pub font_size: Option<f64>,
}

/// Bounding box for a symbol, in local component coordinates.
#[derive(facet::Facet, Clone, Debug)]
pub struct Bounds2d {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Symbol geometry: bounding box + list of graphics primitives.
#[derive(facet::Facet, Clone, Debug)]
pub struct SymbolGraphics {
    pub bounds: Bounds2d,
    pub graphics: Vec<GraphicsElement>,
}

/// Pin with its position in local component coordinates (before rotation/flip).
#[derive(facet::Facet, Clone, Debug)]
pub struct PinLocation {
    pub id: String,
    pub name: String,
    pub x: f64,
    pub y: f64,
}

/// A component definition loaded from a YAML file in the `components/` directory.
#[derive(facet::Facet, Clone, Debug)]
pub struct ComponentDef {
    /// Type identifier, e.g. `"resistor"`, `"dc_voltage"`.
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub subcategory: Option<String>,
    pub keywords: Vec<String>,
    pub properties: Vec<PropertyDef>,
    /// Symbol graphics for rendering on the canvas, if available.
    pub symbol: Option<SymbolGraphics>,
    /// Pin positions in local component coordinates.
    pub pins: Vec<PinLocation>,
}

/// A single turn in the AI conversation (human-readable text only).
#[derive(facet::Facet, Clone, Debug)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

/// A mutation to apply to the circuit after the AI responds.
#[derive(facet::Facet, Clone, Debug)]
#[repr(C)]
pub enum CircuitMutation {
    UpdateProperty { component_id: String, property: String, value: f64 },
    AddComponent { type_id: String, label: Option<String>, properties: Vec<(String, f64)> },
    RemoveComponent { component_id: String },
    SetIntent { intent: Option<String> },
    SetParameter { name: String, value: f64 },
    RemoveParameter { name: String },
}

#[derive(facet::Facet, Clone, Debug)]
pub struct AiChatRequest {
    pub messages: Vec<AiMessage>,
    /// Current circuit serialized as .eerie YAML.
    pub circuit_yaml: String,
    /// Pre-built SPICE netlist (for the run_simulation tool).
    pub spice_netlist: String,
}

#[derive(facet::Facet, Clone, Debug)]
pub struct AiChatResponse {
    pub message: String,
    pub mutations: Vec<CircuitMutation>,
}

/// Describes what the backend can do. The frontend queries this once on
/// connect and adapts its behaviour accordingly.
#[derive(facet::Facet, Clone, Debug)]
pub struct Capabilities {
    /// Backend can read/write files on the host filesystem.
    pub file_io: bool,
    /// Anthropic API key available in the daemon's environment (from
    /// `ANTHROPIC_API_KEY`). When present the frontend can use it directly
    /// instead of asking the user to paste a key.
    pub anthropic_api_key: Option<String>,
}

/// The project directory the daemon was started in.
#[derive(facet::Facet, Clone, Debug)]
pub struct ProjectDir {
    /// Absolute path to the project directory.
    pub path: String,
}

/// Request to list the contents of an eerie project directory.
/// The directory must contain an `eerie.yaml` manifest file.
#[derive(facet::Facet, Clone, Debug)]
pub struct ListProjectRequest {
    /// Absolute path to the project directory.
    pub path: String,
}

/// A flat entry in the project file tree.
/// The daemon emits these in depth-first order (parent dirs before their children),
/// so a tree can be reconstructed by processing entries in order.
#[derive(facet::Facet, Clone, Debug)]
pub struct TreeEntry {
    /// Path relative to the project root, using `/` as separator.
    pub path: String,
    /// Filename only (last path component).
    pub name: String,
    /// One of `"circuit"`, `"file"`, or `"dir"`.
    pub kind: String,
}

/// Request to rename a file or directory.
#[derive(facet::Facet, Clone, Debug)]
pub struct RenameRequest {
    pub from: String,
    pub to: String,
}

/// Request to delete a file or directory (recursive for directories).
#[derive(facet::Facet, Clone, Debug)]
pub struct DeleteRequest {
    pub path: String,
}

/// Request to create a directory (including any missing parents).
#[derive(facet::Facet, Clone, Debug)]
pub struct CreateFolderRequest {
    pub path: String,
}

/// Result of listing a project directory.
#[derive(facet::Facet, Clone, Debug)]
pub struct ProjectListing {
    /// Raw YAML content of the `eerie.yaml` manifest.
    pub manifest_yaml: String,
    /// Root-level circuit filenames (`.eerie` extension). Used for auto-open logic.
    pub circuits: Vec<String>,
    /// Root-level non-circuit filenames. Used for auto-open logic.
    pub files: Vec<String>,
    /// Full file tree as a flat depth-first list (parent dirs before their children).
    pub tree: Vec<TreeEntry>,
}

/// Content returned when opening a file via the daemon.
#[derive(facet::Facet, Clone, Debug)]
pub struct FileContent {
    pub name: String,
    pub content: String,
}

/// Request to open a file. If `path` is empty the daemon should show a
/// native file-picker dialog (if available) or return an error.
#[derive(facet::Facet, Clone, Debug)]
pub struct FileOpenRequest {
    pub path: String,
}

/// Request to save a file. If `path` is empty the daemon should show a
/// native save dialog.
#[derive(facet::Facet, Clone, Debug)]
pub struct FileSaveRequest {
    pub path: String,
    pub content: String,
}

/// Result of a save — contains the path that was actually written to
/// (may differ from request when the user picked a new name).
#[derive(facet::Facet, Clone, Debug)]
pub struct FileSaveResult {
    pub path: String,
}

#[roam::service]
pub trait EerieService {
    /// Query what this backend supports.
    async fn get_capabilities(&self) -> Result<Capabilities, String>;

    /// Open a file on the host filesystem.
    async fn file_open(&self, req: FileOpenRequest) -> Result<FileContent, String>;

    /// Save a file on the host filesystem.
    async fn file_save(&self, req: FileSaveRequest) -> Result<FileSaveResult, String>;

    /// Return the project directory the daemon was started in.
    async fn get_project_dir(&self) -> Result<ProjectDir, String>;

    /// List the circuits in an eerie project directory (must contain `eerie.yaml`).
    async fn list_project(&self, req: ListProjectRequest) -> Result<ProjectListing, String>;

    /// Run .op analysis.
    async fn simulate_op(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .dc sweep analysis.
    async fn simulate_dc(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .ac frequency sweep analysis.
    async fn simulate_ac(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .tran transient analysis.
    async fn simulate_tran(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .noise analysis.
    async fn simulate_noise(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .tf transfer function analysis.
    async fn simulate_tf(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .sens sensitivity analysis.
    async fn simulate_sens(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run .pz pole-zero analysis.
    async fn simulate_pz(&self, netlist: Netlist) -> Result<SimResult, String>;

    /// Run AI chat with agentic circuit editing loop (server-side Anthropic API call).
    async fn ai_chat(&self, req: AiChatRequest) -> Result<AiChatResponse, String>;

    /// List component definitions from the `components/` directory in the workspace.
    async fn list_component_defs(&self) -> Result<Vec<ComponentDef>, String>;

    /// Rename a file or directory.
    async fn rename_path(&self, req: RenameRequest) -> Result<bool, String>;

    /// Delete a file (or recursively delete a directory).
    async fn delete_path(&self, req: DeleteRequest) -> Result<bool, String>;

    /// Create a directory (and any missing parents).
    async fn create_folder(&self, req: CreateFolderRequest) -> Result<bool, String>;
}
