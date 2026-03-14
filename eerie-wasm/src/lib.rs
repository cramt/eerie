#![cfg(target_arch = "wasm32")]
use std::collections::{BTreeMap, BTreeSet};
use eerie_rpc::{
    AiChatRequest, AiChatResponse, AiEditCircuitRequest, AiEditCircuitResponse, Capabilities,
    ComponentDef, CreateFolderRequest, DeleteRequest, EerieService, EerieServiceDispatcher,
    FileContent, FileOpenRequest, FileSaveRequest, FileSaveResult, ListProjectRequest, ProjectDir,
    ProjectListing, RenameRequest, TreeEntry,
};
use roam::DriverCaller;
use roam_inprocess::JsInProcessLink;
use thevenin_types::{Netlist, SimResult};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::js_sys;

// ── localStorage virtual filesystem ─────────────────────────────────────────
// Files:         "eerie-vfs:"     + absolute path   e.g. "eerie-vfs:/circuit.eerie"
// Dir sentinels: "eerie-vfs-dir:" + absolute path   e.g. "eerie-vfs-dir:/subfolder"

const VFS_FILE: &str = "eerie-vfs:";
const VFS_DIR: &str = "eerie-vfs-dir:";

fn storage() -> Option<web_sys::Storage> {
    web_sys::window()?.local_storage().ok()?
}

fn ls_get(key: &str) -> Option<String> {
    storage()?.get_item(key).ok()?
}

fn ls_set(key: &str, value: &str) {
    if let Some(s) = storage() {
        let _ = s.set_item(key, value);
    }
}

fn ls_remove(key: &str) {
    if let Some(s) = storage() {
        let _ = s.remove_item(key);
    }
}

fn ls_all_keys() -> Vec<String> {
    let Some(s) = storage() else { return vec![] };
    let len = s.length().unwrap_or(0);
    (0..len).filter_map(|i| s.key(i).ok()?).collect()
}

/// Insert all strict ancestor path segments into `set`.
/// e.g. "a/b/c" → inserts "a" and "a/b".
fn add_ancestors(set: &mut BTreeSet<String>, path: &str) {
    let mut p = path;
    while let Some(idx) = p.rfind('/') {
        p = &p[..idx];
        if p.is_empty() {
            break;
        }
        set.insert(p.to_string());
    }
}

#[derive(Clone)]
struct WasmService;

impl EerieService for WasmService {
    // ── Simulation ───────────────────────────────────────────────────────────

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

    // ── Capabilities & project dir ───────────────────────────────────────────

    async fn get_capabilities(&self) -> Result<Capabilities, String> {
        Ok(Capabilities { file_io: true, ai_chat: false, ai_edit: false })
    }

    async fn ai_chat(&self, _req: AiChatRequest) -> Result<AiChatResponse, String> {
        Err("AI chat is not available in WASM mode".into())
    }

    async fn ai_edit_circuit(&self, _req: AiEditCircuitRequest) -> Result<AiEditCircuitResponse, String> {
        Err("AI editing is not available in WASM mode".into())
    }

    /// Virtual project root is always "/".
    async fn get_project_dir(&self) -> Result<ProjectDir, String> {
        Ok(ProjectDir { path: "/".to_string() })
    }

    // ── File I/O via localStorage ────────────────────────────────────────────

    async fn file_open(&self, req: FileOpenRequest) -> Result<FileContent, String> {
        let key = format!("{VFS_FILE}{}", req.path);
        let content = ls_get(&key)
            .ok_or_else(|| format!("file not found: {}", req.path))?;
        let name = req.path.rsplit('/').next().unwrap_or(&req.path).to_string();
        Ok(FileContent { name, content })
    }

    async fn file_save(&self, req: FileSaveRequest) -> Result<FileSaveResult, String> {
        ls_set(&format!("{VFS_FILE}{}", req.path), &req.content);
        Ok(FileSaveResult { path: req.path })
    }

    async fn list_project(&self, req: ListProjectRequest) -> Result<ProjectListing, String> {
        // Strip trailing slash: "/" → "", "/proj" → "/proj"
        let proj = req.path.trim_end_matches('/');
        let file_pfx = format!("{VFS_FILE}{proj}/");
        let dir_pfx = format!("{VFS_DIR}{proj}/");
        let manifest_key = format!("{VFS_FILE}{proj}/eerie.yaml");

        let all_keys = ls_all_keys();

        // Auto-create manifest if missing
        let manifest_yaml = match ls_get(&manifest_key) {
            Some(m) => m,
            None => {
                let name = if proj.is_empty() {
                    "My Project".to_string()
                } else {
                    proj.rsplit('/').next().unwrap_or("My Project").to_string()
                };
                let default = format!("name: {name}\n");
                ls_set(&manifest_key, &default);
                default
            }
        };

        // Collect files (skip the manifest itself)
        let mut file_entries: BTreeMap<String, &'static str> = BTreeMap::new();
        let mut root_circuits: Vec<String> = Vec::new();
        let mut root_files: Vec<String> = Vec::new();

        for key in &all_keys {
            if key == &manifest_key {
                continue;
            }
            if let Some(rel) = key.strip_prefix(&file_pfx) {
                let kind = if rel.ends_with(".eerie") { "circuit" } else { "file" };
                file_entries.insert(rel.to_string(), kind);
                if !rel.contains('/') {
                    if kind == "circuit" {
                        root_circuits.push(rel.to_string());
                    } else {
                        root_files.push(rel.to_string());
                    }
                }
            }
        }
        root_circuits.sort();
        root_files.sort();

        // Derive directories: explicit sentinels + implicit ancestors from file paths
        let mut dir_set: BTreeSet<String> = BTreeSet::new();
        for key in &all_keys {
            if let Some(rel) = key.strip_prefix(&dir_pfx) {
                dir_set.insert(rel.to_string());
                add_ancestors(&mut dir_set, rel);
            }
        }
        for rel in file_entries.keys() {
            if let Some(idx) = rel.rfind('/') {
                let parent = &rel[..idx];
                dir_set.insert(parent.to_string());
                add_ancestors(&mut dir_set, parent);
            }
        }

        // Merge into one sorted map. Lexicographic order is depth-first for the
        // client: "a" < "a/b", so parent dirs naturally precede their children.
        let mut all: BTreeMap<String, &'static str> = BTreeMap::new();
        for d in &dir_set {
            all.insert(d.clone(), "dir");
        }
        for (p, k) in &file_entries {
            all.insert(p.clone(), k);
        }

        let tree = all
            .into_iter()
            .map(|(path, kind)| {
                let name = path.rsplit('/').next().unwrap_or(&path).to_string();
                TreeEntry { path, name, kind: kind.to_string() }
            })
            .collect();

        Ok(ProjectListing { manifest_yaml, circuits: root_circuits, files: root_files, tree })
    }

    async fn rename_path(&self, req: RenameRequest) -> Result<bool, String> {
        let from_file = format!("{VFS_FILE}{}", req.from);
        let to_file = format!("{VFS_FILE}{}", req.to);

        // Single file rename
        if let Some(content) = ls_get(&from_file) {
            ls_set(&to_file, &content);
            ls_remove(&from_file);
            return Ok(true);
        }

        // Directory rename: move all descendant file and dir-sentinel keys
        let from_files = format!("{VFS_FILE}{}/", req.from);
        let to_files = format!("{VFS_FILE}{}/", req.to);
        let from_dirs = format!("{VFS_DIR}{}/", req.from);
        let to_dirs = format!("{VFS_DIR}{}/", req.to);
        let from_sentinel = format!("{VFS_DIR}{}", req.from);
        let to_sentinel = format!("{VFS_DIR}{}", req.to);

        let all_keys = ls_all_keys();
        let mut did_rename = false;

        for key in &all_keys {
            if let Some(suffix) = key.strip_prefix(&from_files) {
                if let Some(content) = ls_get(key) {
                    ls_set(&format!("{to_files}{suffix}"), &content);
                    ls_remove(key);
                    did_rename = true;
                }
            } else if let Some(suffix) = key.strip_prefix(&from_dirs) {
                ls_set(&format!("{to_dirs}{suffix}"), "");
                ls_remove(key);
            }
        }
        if ls_get(&from_sentinel).is_some() {
            ls_set(&to_sentinel, "");
            ls_remove(&from_sentinel);
            did_rename = true;
        }

        Ok(did_rename)
    }

    async fn delete_path(&self, req: DeleteRequest) -> Result<bool, String> {
        let file_key = format!("{VFS_FILE}{}", req.path);
        let dir_files = format!("{VFS_FILE}{}/", req.path);
        let dir_dirs = format!("{VFS_DIR}{}/", req.path);
        let sentinel = format!("{VFS_DIR}{}", req.path);

        let all_keys = ls_all_keys();
        let mut deleted = false;

        if ls_get(&file_key).is_some() {
            ls_remove(&file_key);
            deleted = true;
        }
        for key in &all_keys {
            if key.starts_with(&dir_files)
                || key.starts_with(&dir_dirs)
                || key == &sentinel
            {
                ls_remove(key);
                deleted = true;
            }
        }

        Ok(deleted)
    }

    async fn create_folder(&self, req: CreateFolderRequest) -> Result<bool, String> {
        ls_set(&format!("{VFS_DIR}{}", req.path), "");
        Ok(true)
    }

    // ── Component defs ───────────────────────────────────────────────────────
    // WASM has no YAML parser, so component defs are unavailable.

    async fn list_component_defs(&self) -> Result<Vec<ComponentDef>, String> {
        Ok(vec![])
    }
}

/// Start a roam acceptor using the in-process transport.
///
/// Returns a `JsInProcessLink` that JS should wire to an `InProcessTransport`.
#[wasm_bindgen]
pub fn start_acceptor(on_message: js_sys::Function) -> JsInProcessLink {
    let mut js_link = JsInProcessLink::new(on_message);
    let link = js_link
        .take_link()
        .expect("take_link should succeed on fresh JsInProcessLink");

    let dispatcher = EerieServiceDispatcher::new(WasmService);

    wasm_bindgen_futures::spawn_local(async move {
        match roam::acceptor(link)
            .establish::<DriverCaller>(dispatcher)
            .await
        {
            Ok((_guard, _handle)) => {
                std::future::pending::<()>().await;
            }
            Err(e) => {
                let _ = e; // session error, logged to JS console via roam internals
            }
        }
    });

    js_link
}
