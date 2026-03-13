pub use thevenin_types::{Netlist, SimResult};

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

/// Result of listing a project directory.
#[derive(facet::Facet, Clone, Debug)]
pub struct ProjectListing {
    /// Raw YAML content of the `eerie.yaml` manifest.
    pub manifest_yaml: String,
    /// Circuit filenames in the project (full filenames including `.eerie` extension).
    pub circuits: Vec<String>,
    /// Other (non-circuit) files in the project directory, with full filenames.
    pub files: Vec<String>,
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
}
