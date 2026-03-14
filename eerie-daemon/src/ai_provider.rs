use std::{future::Future, path::PathBuf, pin::Pin, sync::Arc};

/// Abstraction over an AI completion backend.
pub trait AiProvider: Send + Sync {
    fn complete<'a>(
        &'a self,
        system: &'a str,
        user: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>>;
}

/// Implementation that spawns the `claude` CLI in one-shot (`-p`) mode.
pub struct ClaudeCliProvider {
    pub project_dir: PathBuf,
}

impl AiProvider for ClaudeCliProvider {
    fn complete<'a>(
        &'a self,
        system: &'a str,
        user: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>> {
        let prompt = format!("{system}\n\n{user}");
        let project_dir = self.project_dir.clone();
        Box::pin(async move {
            log::info!("[ai_provider] spawning claude CLI (prompt {} chars)", prompt.len());
            let t0 = std::time::Instant::now();

            let output = tokio::process::Command::new("claude")
                .arg("-p")
                .arg(&prompt)
                .arg("--output-format")
                .arg("stream-json")
                .arg("--verbose")
                .env_remove("CLAUDECODE")
                .current_dir(&project_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("failed to spawn claude: {e}"))?;

            let elapsed = t0.elapsed();
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            log::info!(
                "[ai_provider] claude exited in {:.1}s, status={:?}, stdout={} bytes, stderr={} bytes",
                elapsed.as_secs_f64(),
                output.status.code(),
                stdout.len(),
                stderr.len(),
            );
            if !stderr.trim().is_empty() {
                log::warn!("[ai_provider] claude stderr: {}", stderr.trim());
            }

            parse_claude_result(&stdout, &stderr, output.status.code())
        })
    }
}

/// Parse NDJSON output from the `claude` CLI and extract the result text.
/// Used by both `ClaudeCliProvider` and `DaemonService::ai_chat`.
pub fn parse_claude_result(
    stdout: &str,
    stderr: &str,
    status_code: Option<i32>,
) -> Result<String, String> {
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if val.get("type").and_then(|t| t.as_str()) == Some("result") {
            let text = val
                .get("result")
                .and_then(|r| r.as_str())
                .unwrap_or("")
                .to_string();
            return Ok(text);
        }
    }

    let stderr_snippet = if stderr.trim().is_empty() {
        String::new()
    } else {
        format!(": {}", stderr.trim())
    };
    Err(format!(
        "claude exited with status {:?} but produced no result event{stderr_snippet}",
        status_code
    ))
}

/// Construct the appropriate `AiProvider` based on the `EERIE_AI_PROVIDER`
/// environment variable. Defaults to `"claude"`.
pub fn make_provider(project_dir: PathBuf) -> Arc<dyn AiProvider + Send + Sync> {
    let _provider_name = std::env::var("EERIE_AI_PROVIDER").unwrap_or_else(|_| "claude".into());
    // Future: match on _provider_name to select Codex, Ollama, etc.
    Arc::new(ClaudeCliProvider { project_dir })
}
