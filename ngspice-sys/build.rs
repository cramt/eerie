use std::env;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-env-changed=NGSPICE_LIB_DIR");
    println!("cargo:rerun-if-env-changed=NGSPICE_INCLUDE_DIR");

    let lib_dir = env::var("NGSPICE_LIB_DIR").expect(
        "NGSPICE_LIB_DIR must be set to the directory containing libngspice.so.\n\
         In the Nix dev shell this is set automatically via shellHook.\n\
         Outside Nix: export NGSPICE_LIB_DIR=/usr/lib",
    );
    let include_dir = env::var("NGSPICE_INCLUDE_DIR").expect(
        "NGSPICE_INCLUDE_DIR must be set to the directory containing ngspice/sharedspice.h.\n\
         In the Nix dev shell this is set automatically via shellHook.\n\
         Outside Nix: export NGSPICE_INCLUDE_DIR=/usr/include",
    );

    println!("cargo:rustc-link-search=native={lib_dir}");
    println!("cargo:rustc-link-lib=dylib=ngspice");

    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_arg(format!("-I{include_dir}"))
        // Only pull in ngspice API surface
        .allowlist_function("ngSpice_.*")
        .allowlist_function("ngGet_Vec_Info")
        // Core data types
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
        // Callback function pointer types
        .allowlist_type("SendChar")
        .allowlist_type("SendStat")
        .allowlist_type("ControlledExit")
        .allowlist_type("SendData")
        .allowlist_type("SendInitData")
        .allowlist_type("BGThreadRunning")
        .allowlist_type("GetVSRCData")
        .allowlist_type("GetISRCData")
        .allowlist_type("GetSyncData")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .expect("Failed to generate ngspice FFI bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Failed to write ngspice bindings to OUT_DIR");
}
