use eerie_core::circuit::Circuit;
use eerie_core::component::{
    COMPONENT_KINDS, Component, ComponentData, Metadata, PinMeta, pin_definitions,
};
use eerie_rpc::{Capabilities, FileContent, FileOpenRequest, FileSaveRequest, FileSaveResult};
use facet_typescript::TypeScriptGenerator;
use std::{fs, path::PathBuf};

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .to_path_buf()
}

fn main() {
    generate_facet_types();
    generate_rpc_client();
}

// ── Facet data types → types.ts ──────────────────────────────────────────────

fn generate_facet_types() {
    let mut generator = TypeScriptGenerator::new();

    // Circuit model
    generator.add_type::<Circuit>();
    generator.add_type::<Metadata>();
    generator.add_type::<Component>();
    generator.add_type::<ComponentData>();
    generator.add_type::<PinMeta>();

    // RPC types
    generator.add_type::<Capabilities>();
    generator.add_type::<FileContent>();
    generator.add_type::<FileOpenRequest>();
    generator.add_type::<FileSaveRequest>();
    generator.add_type::<FileSaveResult>();

    // SPICE netlist types (from thevenin-types)
    generator.add_type::<thevenin_types::Netlist>();
    generator.add_type::<thevenin_types::Item>();
    generator.add_type::<thevenin_types::Element>();
    generator.add_type::<thevenin_types::ElementKind>();
    generator.add_type::<thevenin_types::Expr>();
    generator.add_type::<thevenin_types::Source>();
    generator.add_type::<thevenin_types::Analysis>();
    generator.add_type::<thevenin_types::SimResult>();
    generator.add_type::<thevenin_types::SimPlot>();
    generator.add_type::<thevenin_types::SimVector>();
    generator.add_type::<thevenin_types::Complex>();

    let ts_body = generator.finish();

    // Generate pin metadata constants
    let mut pin_defs = String::new();
    pin_defs.push_str("\n/**\n * Pin definitions per component type.\n * Single source of truth — generated from Rust.\n */\n");
    pin_defs.push_str("export const PIN_DEFINITIONS: Record<string, PinMeta[]> = {\n");
    for kind in COMPONENT_KINDS {
        let pins = pin_definitions(kind);
        pin_defs.push_str(&format!("  \"{}\": [\n", kind));
        for pin in &pins {
            match &pin.file_alias {
                Some(alias) => pin_defs.push_str(&format!(
                    "    {{ name: \"{}\", file_alias: \"{}\" }},\n",
                    pin.name, alias
                )),
                None => pin_defs.push_str(&format!(
                    "    {{ name: \"{}\", file_alias: null }},\n",
                    pin.name
                )),
            }
        }
        pin_defs.push_str("  ],\n");
    }
    pin_defs.push_str("};\n");

    // Generate FILE_PIN_TO_UI mapping (derived from pin definitions)
    pin_defs.push_str("\n/**\n * Pin name mapping: .eerie file pin_id → UI pin name.\n * Generated from PIN_DEFINITIONS — do not edit.\n */\n");
    pin_defs.push_str("export const FILE_PIN_TO_UI: Record<string, Record<string, string>> = {\n");
    for kind in COMPONENT_KINDS {
        let pins = pin_definitions(kind);
        let has_aliases = pins.iter().any(|p| p.file_alias.is_some());
        if has_aliases {
            pin_defs.push_str(&format!("  \"{}\": {{ ", kind));
            for pin in &pins {
                if let Some(alias) = &pin.file_alias {
                    pin_defs.push_str(&format!("{}: \"{}\", ", alias, pin.name));
                }
            }
            pin_defs.push_str("},\n");
        }
    }
    pin_defs.push_str("};\n");

    // Generate UI_PIN_TO_FILE mapping (reverse of FILE_PIN_TO_UI)
    pin_defs.push_str("\n/**\n * Reverse mapping: UI pin name → .eerie file pin_id.\n * Generated from PIN_DEFINITIONS — do not edit.\n */\n");
    pin_defs.push_str("export const UI_PIN_TO_FILE: Record<string, Record<string, string>> = {\n");
    for kind in COMPONENT_KINDS {
        let pins = pin_definitions(kind);
        let has_aliases = pins.iter().any(|p| p.file_alias.is_some());
        if has_aliases {
            pin_defs.push_str(&format!("  \"{}\": {{ ", kind));
            for pin in &pins {
                if let Some(alias) = &pin.file_alias {
                    pin_defs.push_str(&format!("{}: \"{}\", ", pin.name, alias));
                }
            }
            pin_defs.push_str("},\n");
        }
    }
    pin_defs.push_str("};\n");

    let header = "\
// ⚠️  AUTO-GENERATED — do not edit by hand.
// Source of truth: eerie-core/src/ + thevenin-types (Rust types with #[derive(Facet)])
// Regenerate with: pnpm codegen
//
// All types here have an exact Rust counterpart. When you change a Rust
// type, re-run codegen and commit the updated types.ts alongside it.

";

    let out = workspace_root().join("src/codegen/types.ts");
    fs::create_dir_all(out.parent().unwrap()).expect("create types dir");
    fs::write(&out, format!("{header}{ts_body}{pin_defs}")).expect("write types.ts");
    println!("✓ Facet types → {}", out.display());
}

// ── Roam RPC client → generated-rpc.ts ─────────────────────────────────────

fn generate_rpc_client() {
    let descriptor = eerie_rpc::eerie_service_service_descriptor();
    let ts_code = roam_codegen::targets::typescript::generate_service(descriptor);

    let out = workspace_root().join("src/codegen/generated-rpc.ts");
    fs::create_dir_all(out.parent().unwrap()).expect("create codegen dir");
    fs::write(&out, ts_code).expect("write generated-rpc.ts");
    println!("✓ RPC client  → {}", out.display());
}
