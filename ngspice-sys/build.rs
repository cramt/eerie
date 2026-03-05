use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Apply patches needed for Emscripten/WASM builds.
fn apply_wasm_patches(src_dir: &Path) {
    // Guard getrusage in misc_time.c — not available under Emscripten
    let misc_time = src_dir.join("src/misc/misc_time.c");
    if misc_time.exists() {
        let content = fs::read_to_string(&misc_time).unwrap();
        let patched = content.replace(
            "#ifdef HAVE_GETRUSAGE",
            "#if defined(HAVE_GETRUSAGE) && !defined(__EMSCRIPTEN__)",
        );
        fs::write(&misc_time, patched).unwrap();
    }
}

/// Recursively find all `.a` files under a directory.
fn find_archives(dir: &Path, archives: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                find_archives(&path, &mut *archives);
            } else if path.extension().map(|e| e == "a").unwrap_or(false) {
                archives.push(path);
            }
        }
    }
}

/// Recursively find all `.o` files under a directory.
fn find_objects(dir: &Path, objects: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                find_objects(&path, &mut *objects);
            } else if path.extension().map(|e| e == "o").unwrap_or(false) {
                objects.push(path);
            }
        }
    }
}

/// Create a merged static archive from all component libraries and objects
/// produced by the autotools build. ngspice's --with-ngshared only produces
/// a .so, but we need a .a for static linking.
fn create_merged_archive(build_dir: &Path, install_dir: &Path) {
    let lib_dir = install_dir.join("lib");
    fs::create_dir_all(&lib_dir).unwrap();

    let merged_archive = lib_dir.join("libngspice.a");

    // Collect all component .a files from the build tree.
    // Exclude xspice/icm/ — those are code model shared libraries (.cm) that
    // define wrapper versions of MIF* functions via dlmain.c. Including them
    // in the static archive would override the real implementations.
    let mut archives = Vec::new();
    let build_src_dir = build_dir.join("src");
    find_archives(&build_src_dir, &mut archives);
    archives.retain(|p| {
        let s = p.to_str().unwrap_or("");
        !s.contains("/xspice/icm/")
    });

    // Collect the top-level .o files (sharedspice, conf, ngspice entry)
    let mut top_objects = Vec::new();
    let libs_dir = build_src_dir.join(".libs");
    if libs_dir.exists() {
        find_objects(&libs_dir, &mut top_objects);
    }

    // Create a temporary directory for extraction
    let tmp_dir = install_dir.join("_merge_tmp");
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir).unwrap();
    }
    fs::create_dir_all(&tmp_dir).unwrap();

    // Extract all .a files into the temp dir (with unique prefixes to avoid name collisions)
    for (i, archive) in archives.iter().enumerate() {
        let sub_dir = tmp_dir.join(format!("lib_{i}"));
        fs::create_dir_all(&sub_dir).unwrap();
        let status = Command::new("ar")
            .args(["x", archive.to_str().unwrap()])
            .current_dir(&sub_dir)
            .status()
            .expect("failed to run ar x");
        if !status.success() {
            eprintln!("warning: ar x failed for {}", archive.display());
            continue;
        }
        // Rename extracted .o files with prefix to avoid collisions
        if let Ok(entries) = fs::read_dir(&sub_dir) {
            for entry in entries.flatten() {
                let old_name = entry.file_name();
                let new_name = format!("{}_{}", i, old_name.to_str().unwrap());
                fs::rename(entry.path(), sub_dir.join(&new_name)).unwrap();
            }
        }
    }

    // Collect all extracted .o files
    let mut all_objects = Vec::new();
    find_objects(&tmp_dir, &mut all_objects);

    // Add top-level objects
    for obj in &top_objects {
        all_objects.push(obj.clone());
    }

    // Create the merged archive
    let ar = env::var("AR").unwrap_or_else(|_| "ar".to_string());
    let mut cmd = Command::new(&ar);
    cmd.arg("crs").arg(&merged_archive);
    for obj in &all_objects {
        cmd.arg(obj);
    }
    let status = cmd.status().expect("failed to run ar crs");
    assert!(status.success(), "failed to create merged archive");

    // Clean up temp dir
    let _ = fs::remove_dir_all(&tmp_dir);

    eprintln!(
        "Created merged static archive: {} ({} objects from {} component archives + {} top-level objects)",
        merged_archive.display(),
        all_objects.len(),
        archives.len(),
        top_objects.len()
    );
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=wrapper.h");
    println!("cargo:rerun-if-changed=ngspice-src/configure");

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let target = env::var("TARGET").unwrap_or_default();

    // Copy vendored source into OUT_DIR (using cp -a to preserve timestamps,
    // which prevents make from trying to re-run automake/autoconf).
    // We use rsync to do an incremental copy — only changed files are updated,
    // so autotools' `make` can skip unchanged objects.
    let build_src = out_dir.join("ngspice-src");
    let build_dir = out_dir.join("build");
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let vendored_src = manifest_dir.join("ngspice-src");
    // rsync with --delete so removed upstream files are cleaned, but unchanged
    // files keep their timestamps → make treats them as up-to-date.
    let status = Command::new("rsync")
        .args([
            "-a", "--delete",
            &format!("{}/", vendored_src.to_str().unwrap()),
            &format!("{}/", build_src.to_str().unwrap()),
        ])
        .status()
        .expect("failed to run rsync — is it installed? add it to flake.nix devShell");
    assert!(status.success(), "rsync failed");

    // Apply WASM patches if targeting Emscripten
    if target.contains("emscripten") {
        apply_wasm_patches(&build_src);
    }

    // Build ngspice using autotools.
    // --with-ngshared enables the shared library API (sharedspice.h functions).
    // We must enable_shared() because ngspice's Makefile.am hardcodes -shared
    // flags for libngspice when SHARED_MODULE is set.
    let mut cfg = autotools::Config::new(&build_src);
    cfg.enable_shared()
        .enable_static()
        .with("ngshared", None)
        .without("readline", None)
        .disable("maintainer-mode", None)
        .disable("openmp", None)
        .disable("osdi", None)
        .disable("debug", None)
        .disable("cider", None)
        .disable("pss", None);

    // If the vendored source doesn't have a `configure` script (e.g. after
    // a fresh clone where only configure.ac is tracked), run autoreconf.
    if !build_src.join("configure").exists() {
        cfg.reconf("-ivf");
    }

    let install_dir = cfg.build();

    // ngspice's --with-ngshared only produces a .so — create a merged .a
    // from the component archives so we can link statically.
    create_merged_archive(&build_dir, &install_dir);

    // Remove the .so files so cargo doesn't accidentally link them
    let lib_dir = install_dir.join("lib");
    if let Ok(entries) = fs::read_dir(&lib_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_str().unwrap_or("");
            if name.starts_with("libngspice.so") || name == "libngspice.la" {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    // Emit linker search paths
    println!(
        "cargo:rustc-link-search=native={}",
        lib_dir.display()
    );
    println!("cargo:rustc-link-lib=static=ngspice");

    // System libraries needed by ngspice
    if !target.contains("emscripten") {
        println!("cargo:rustc-link-lib=m");
        println!("cargo:rustc-link-lib=stdc++");
        println!("cargo:rustc-link-lib=pthread");
        if target.contains("linux") {
            println!("cargo:rustc-link-lib=dl");
            // Export symbols so XSPICE code model .cm files loaded via
            // dlopen can resolve ngspice symbols from the host binary.
            println!("cargo:rustc-link-arg=-rdynamic");
        }
    }

    // Tell downstream crates where the code model .cm files are installed
    println!(
        "cargo:cm_dir={}",
        install_dir.join("lib/ngspice").display()
    );
    // And where spinit/scripts live
    println!(
        "cargo:scripts_dir={}",
        install_dir.join("share/ngspice/scripts").display()
    );

    // Generate Rust bindings with bindgen
    let include_dir = install_dir.join("include");
    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_arg(format!("-I{}", include_dir.display()))
        // Internal ngspice headers (for XSPICE/MIF types not installed to include/)
        .clang_arg(format!("-I{}", build_src.join("src/include").display()))
        // Build-tree config.h (ensures bindgen sees same #defines as compiled archive)
        .clang_arg(format!("-I{}", build_dir.join("src/include").display()))
        .clang_arg("-DXSPICE=1")
        // --- sharedspice.h API ---
        .allowlist_function("ngSpice_.*")
        .allowlist_function("ngGet_Vec_Info")
        .allowlist_type("ngcomplex_t")
        .allowlist_type("vector_info")
        .allowlist_type("pvector_info")
        .allowlist_type("vecinfo")
        .allowlist_type("pvecinfo")
        .allowlist_type("vecinfoall")
        .allowlist_type("pvecinfoall")
        .allowlist_type("vecvalues")
        .allowlist_type("pvecvalues")
        .allowlist_type("vecvaluesall")
        .allowlist_type("pvecvaluesall")
        .allowlist_type("SendChar")
        .allowlist_type("SendStat")
        .allowlist_type("ControlledExit")
        .allowlist_type("SendData")
        .allowlist_type("SendInitData")
        .allowlist_type("BGThreadRunning")
        .allowlist_type("GetVSRCData")
        .allowlist_type("GetISRCData")
        .allowlist_type("GetSyncData")
        // --- XSPICE / MIF types ---
        .allowlist_type("SPICEdev")
        .allowlist_type("IFdevice")
        .allowlist_type("IFparm")
        .allowlist_type("Mif_Private")
        .allowlist_type("Mif_Private_t")
        .allowlist_type("Mif_Conn_Info")
        .allowlist_type("Mif_Conn_Info_t")
        .allowlist_type("Mif_Param_Info")
        .allowlist_type("Mif_Param_Info_t")
        .allowlist_type("Mif_Inst_Var_Info")
        .allowlist_type("Mif_Inst_Var_Info_t")
        .allowlist_type("Mif_Value_t")
        .allowlist_type("Mif_Parse_Value")
        .allowlist_type("Mif_Parse_Value_t")
        .allowlist_type("Mif_Port_Type_t")
        .allowlist_type("Mif_Dir_t")
        .allowlist_type("Mif_Data_Type_t")
        .allowlist_type("Mif_Analysis_t")
        .allowlist_type("Mif_Conn_Data")
        .allowlist_type("Mif_Conn_Data_t")
        .allowlist_type("Mif_Port_Data")
        .allowlist_type("Mif_Port_Data_t")
        .allowlist_type("Mif_Param_Data")
        .allowlist_type("Mif_Param_Data_t")
        .allowlist_type("Mif_Inst_Var_Data")
        .allowlist_type("Mif_Inst_Var_Data_t")
        .allowlist_type("Mif_Circ_Data")
        .allowlist_type("Mif_Circ_Data_t")
        .allowlist_type("MIFinstance")
        .allowlist_type("MIFmodel")
        .allowlist_type("Mif_Boolean_t")
        .allowlist_type("Mif_Callback_t")
        .allowlist_type("Mif_Callback_Reason_t")
        // --- XSPICE functions ---
        .allowlist_function("add_device")
        .allowlist_function("MIFload")
        .allowlist_function("MIFsetup")
        .allowlist_function("MIFunsetup")
        .allowlist_function("MIFmParam")
        .allowlist_function("MIFask")
        .allowlist_function("MIFmAsk")
        .allowlist_function("MIFtrunc")
        .allowlist_function("MIFconvTest")
        .allowlist_function("MIFdelete")
        .allowlist_function("MIFmDelete")
        .allowlist_function("MIFdestroy")
        // --- XSPICE variables ---
        .allowlist_var("MIFiSize")
        .allowlist_var("MIFmSize")
        // Opaque types — avoid pulling in entire internal type graph.
        // Must allowlist + mark opaque so bindgen emits an opaque stub.
        .allowlist_type("CKTcircuit")
        .opaque_type("CKTcircuit")
        .allowlist_type("SMPmatrix")
        .opaque_type("SMPmatrix")
        .allowlist_type("SENstruct")
        .opaque_type("SENstruct")
        .allowlist_type("Ndata")
        .opaque_type("Ndata")
        .allowlist_type("SPcomplex")
        .opaque_type("SPcomplex")
        .allowlist_type("Evt_Output_Event")
        .opaque_type("Evt_Output_Event")
        .allowlist_type("GENmodel")
        .opaque_type("GENmodel")
        .allowlist_type("GENinstance")
        .opaque_type("GENinstance")
        .allowlist_type("IFvalue")
        .opaque_type("IFvalue")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .expect("Failed to generate ngspice FFI bindings");

    bindings
        .write_to_file(out_dir.join("bindings.rs"))
        .expect("Failed to write ngspice bindings to OUT_DIR");
}
