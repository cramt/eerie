use std::path::PathBuf;

use claude_agent_sdk_deno::{QueryOptions, QueryParams};

static CIRCUIT_EDITOR_PROMPT: &str = include_str!("../../prompts/circuit-editor.md");

/// Run an Agent SDK query against a circuit file.
///
/// Writes `circuit_yaml` to a temp `.eerie` file, lets the agent edit it
/// with tools (Read, Edit, Glob, Grep), then reads back the result.
pub async fn ai_edit_circuit(
    project_dir: &PathBuf,
    circuit_yaml: &str,
    instruction: &str,
    focused_component_id: Option<&str>,
) -> Result<String, String> {
    // Write circuit to a temp file so the agent can Edit it in place.
    let tmp_dir = project_dir.join(".eerie-tmp");
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("failed to create temp dir: {e}"))?;
    let tmp_path = tmp_dir.join("edit-target.eerie");
    std::fs::write(&tmp_path, circuit_yaml)
        .map_err(|e| format!("failed to write temp circuit: {e}"))?;

    let mut prompt = format!(
        "Edit the circuit file at `{}`. Instruction: {}",
        tmp_path.display(),
        instruction.trim(),
    );

    if let Some(comp_id) = focused_component_id {
        prompt.push_str(&format!(
            "\n\nThe user is focused on component `{comp_id}`."
        ));
    }

    log::info!(
        "[ai_edit] running agent: instruction={:?}, focused={:?}, file={}",
        instruction, focused_component_id, tmp_path.display(),
    );
    let t0 = std::time::Instant::now();

    let rx = claude_agent_sdk_deno::query(QueryParams {
        prompt,
        options: QueryOptions {
            cwd: Some(project_dir.to_string_lossy().into_owned()),
            allowed_tools: Some(vec![
                "Read".into(),
                "Edit".into(),
                "Write".into(),
                "Glob".into(),
                "Grep".into(),
            ]),
            system_prompt: Some(CIRCUIT_EDITOR_PROMPT.to_string()),
            permission_mode: Some("acceptEdits".into()),
            max_turns: Some(20),
            ..Default::default()
        },
    })
    .await?;

    // Wait for the query to finish (we don't need intermediate messages).
    let mut last_err = None;
    let mut receiver = rx;
    while let Some(msg) = receiver.recv().await {
        if let Err(e) = msg {
            last_err = Some(e);
        }
    }

    if let Some(e) = last_err {
        // Clean up temp file on error.
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    log::info!(
        "[ai_edit] agent finished in {:.1}s",
        t0.elapsed().as_secs_f64(),
    );

    // Read back the edited file.
    let result = std::fs::read_to_string(&tmp_path)
        .map_err(|e| format!("failed to read edited circuit: {e}"))?;

    // Clean up.
    let _ = std::fs::remove_file(&tmp_path);
    let _ = std::fs::remove_dir(&tmp_dir); // only succeeds if empty

    Ok(result)
}

/// Run an Agent SDK query for freeform AI chat about the project.
pub async fn ai_chat(
    project_dir: &PathBuf,
    message: &str,
) -> Result<String, String> {
    log::info!("[ai_chat] message={} chars", message.len());

    let rx = claude_agent_sdk_deno::query(QueryParams {
        prompt: message.to_string(),
        options: QueryOptions {
            cwd: Some(project_dir.to_string_lossy().into_owned()),
            allowed_tools: Some(vec![
                "Read".into(),
                "Glob".into(),
                "Grep".into(),
            ]),
            max_turns: Some(10),
            ..Default::default()
        },
    })
    .await?;

    rx.result().await
}
