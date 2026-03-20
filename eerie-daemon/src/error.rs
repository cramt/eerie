use std::path::PathBuf;

/// Typed error for daemon service operations.
///
/// Converted to `String` at the RPC trait boundary (roam requires `Result<T, String>`).
#[derive(Debug, thiserror::Error)]
pub enum DaemonError {
    #[error("failed to {operation} {}: {source}", path.display())]
    FileIo {
        operation: &'static str,
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("failed to create directories for {}: {source}", path.display())]
    CreateDir {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("not an eerie project (no eerie.yaml): {source}")]
    NotAProject { source: std::io::Error },

    #[error("cannot read directory: {source}")]
    ReadDir { source: std::io::Error },

    #[error("rename failed: {source}")]
    Rename { source: std::io::Error },

    #[error("delete failed: {source}")]
    Delete { source: std::io::Error },

    #[error("mkdir failed: {source}")]
    Mkdir { source: std::io::Error },

    #[error("AI returned invalid YAML: {0}")]
    AiYamlParse(String),

    #[error("{0}")]
    AiValidation(String),

    #[error("simulation failed: {0}")]
    Simulation(String),
}

impl From<DaemonError> for String {
    fn from(e: DaemonError) -> String {
        e.to_string()
    }
}
