use eerie_rpc::{
    Capabilities, EerieService, FileContent, FileOpenRequest, FileSaveRequest, FileSaveResult,
};
use thevenin_types::{Netlist, SimResult};

#[derive(Clone)]
pub struct DaemonService;

impl EerieService for DaemonService {
    async fn get_capabilities(&self) -> Result<Capabilities, String> {
        Ok(Capabilities { file_io: true })
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
}
