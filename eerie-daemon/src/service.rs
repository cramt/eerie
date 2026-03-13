use eerie_rpc::{
    AiChatRequest, AiChatResponse, Capabilities, EerieService, FileContent, FileOpenRequest,
    FileSaveRequest, FileSaveResult, ListProjectRequest, ProjectDir, ProjectListing,
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
}
