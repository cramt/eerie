use proc_macro::TokenStream;
use quote::quote;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::PathBuf,
    process::Command,
};
use unsynn::{IParse, LiteralString, TokenIter};

/// Bundle a TypeScript file at compile time using esbuild.
///
/// The path is relative to the crate root (`CARGO_MANIFEST_DIR`).
/// Returns the bundled JavaScript as a `&'static str`.
///
/// Cargo will automatically re-compile when the TypeScript file changes.
///
/// ```rust
/// let js: &str = deno_bundle::bundle!("src/hello.ts");
/// ```
#[proc_macro]
pub fn bundle(input: TokenStream) -> TokenStream {
    let mut tokens = TokenIter::new(proc_macro2::TokenStream::from(input));
    let path_lit: LiteralString = tokens
        .parse_all()
        .expect("bundle! expects a single string literal path");
    let rel_path = path_lit.as_str();

    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let entry = PathBuf::from(&manifest_dir).join(rel_path);

    let source = std::fs::read(&entry)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", entry.display()));

    // Cache by content hash — reuse output if the file hasn't changed.
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    let hash = hasher.finish();
    let output = std::env::temp_dir().join(format!("deno_bundle_{hash:x}.js"));

    if !output.exists() {
        let out = Command::new("esbuild")
            .arg("--bundle")
            .arg("--format=esm")
            .arg(format!("--outfile={}", output.display()))
            .arg(&entry)
            .output()
            .unwrap_or_else(|e| panic!("failed to spawn esbuild: {e}"));

        if !out.status.success() {
            panic!(
                "esbuild failed (exit {})\n  entry: {}\n{}",
                out.status,
                entry.display(),
                String::from_utf8_lossy(&out.stderr),
            );
        }
    }

    let js = std::fs::read_to_string(&output)
        .unwrap_or_else(|e| panic!("failed to read esbuild output: {e}"));

    // include_str! on the entry file causes cargo to re-run this macro
    // whenever the TypeScript source changes.
    let entry_str = entry.to_str().expect("non-UTF-8 path");
    quote! {
        {
            const _: &str = include_str!(#entry_str);
            ::deno_run::JsBundle::new(#js)
        }
    }
    .into()
}
