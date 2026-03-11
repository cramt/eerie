use std::{fs, path::PathBuf};

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .to_path_buf()
}

fn main() {
    let descriptor = eerie_rpc::eerie_service_service_descriptor();
    let ts_code = roam_codegen::targets::typescript::generate_service(descriptor);

    let out = workspace_root().join("src/codegen/generated-rpc.ts");
    fs::create_dir_all(out.parent().unwrap()).expect("create codegen dir");
    fs::write(&out, ts_code).expect("write generated-rpc.ts");
    println!("✓ RPC client  → {}", out.display());
}
