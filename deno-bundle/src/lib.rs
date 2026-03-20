use proc_macro::TokenStream;
use quote::quote;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::PathBuf,
    process::Command,
};

/// Node.js built-in module names. When `--platform=node` is passed, the macro
/// automatically adds `--alias:X=node:X` for each of these so that Deno can
/// resolve them via its Node compat layer.
const NODE_BUILTINS: &[&str] = &[
    "assert", "assert/strict", "async_hooks", "buffer", "child_process",
    "cluster", "console", "constants", "crypto", "dgram",
    "diagnostics_channel", "dns", "dns/promises", "domain", "events",
    "fs", "fs/promises", "http", "http2", "https", "inspector",
    "inspector/promises", "module", "net", "os", "path", "path/posix",
    "path/win32", "perf_hooks", "process", "punycode", "querystring",
    "readline", "readline/promises", "repl", "stream", "stream/consumers",
    "stream/promises", "stream/web", "string_decoder", "sys", "timers",
    "timers/promises", "tls", "tty", "url", "util", "util/types", "v8",
    "vm", "wasi", "worker_threads", "zlib",
];

/// Bundle a TypeScript file at compile time using esbuild.
///
/// The path is relative to the crate root (`CARGO_MANIFEST_DIR`).
///
/// Cargo will automatically re-compile when the TypeScript file changes.
///
/// ```rust
/// let js = deno_bundle::bundle!("src/hello.ts");
/// ```
///
/// Extra esbuild arguments can be passed as additional string literals:
///
/// ```rust
/// let js = deno_bundle::bundle!("src/hello.ts", "--platform=node");
/// ```
///
/// When `--platform=node` is present, the macro:
/// 1. Adds `--alias:X=node:X` for every Node built-in so Deno resolves them.
/// 2. Returns a `JsModule` instead of `JsBundle` (ES module execution).
#[proc_macro]
pub fn bundle(input: TokenStream) -> TokenStream {
    let input2 = proc_macro2::TokenStream::from(input);
    let mut strings: Vec<String> = Vec::new();

    let mut expecting_string = true;
    for tt in input2 {
        match tt {
            proc_macro2::TokenTree::Literal(lit) => {
                if !expecting_string {
                    panic!("bundle!: unexpected literal, expected comma");
                }
                let repr = lit.to_string();
                let s = repr
                    .strip_prefix('"')
                    .and_then(|s| s.strip_suffix('"'))
                    .unwrap_or_else(|| panic!("bundle!: expected string literal, got {repr}"));
                strings.push(s.to_string());
                expecting_string = false;
            }
            proc_macro2::TokenTree::Punct(p) if p.as_char() == ',' => {
                if expecting_string {
                    panic!("bundle!: unexpected comma");
                }
                expecting_string = true;
            }
            other => panic!("bundle!: unexpected token: {other}"),
        }
    }

    assert!(!strings.is_empty(), "bundle! expects at least a path argument");

    let rel_path = &strings[0];
    let extra_args = &strings[1..];
    let is_node = extra_args.iter().any(|a| a.contains("platform=node"));

    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let entry = PathBuf::from(&manifest_dir).join(rel_path);

    let source = std::fs::read(&entry)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", entry.display()));

    // Cache by content hash (includes extra args so different configs get separate caches).
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    extra_args.hash(&mut hasher);
    is_node.hash(&mut hasher);
    let hash = hasher.finish();
    let output = std::env::temp_dir().join(format!("deno_bundle_{hash:x}.js"));

    if !output.exists() {
        let mut cmd = Command::new("esbuild");
        cmd.arg("--bundle")
            .arg("--format=esm")
            .arg(format!("--outfile={}", output.display()));

        for arg in extra_args {
            cmd.arg(arg);
        }

        // Add node: aliases so Deno can resolve built-in modules.
        if is_node {
            for builtin in NODE_BUILTINS {
                cmd.arg(format!("--alias:{builtin}=node:{builtin}"));
            }
        }

        cmd.arg(&entry);

        let out = cmd
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
    if is_node {
        // ESM output with node imports — must run as an ES module.
        quote! {
            {
                const _: &str = include_str!(#entry_str);
                ::deno_run::JsModule::new(#js)
            }
        }
        .into()
    } else {
        // Self-contained bundle — runs as a classic script.
        quote! {
            {
                const _: &str = include_str!(#entry_str);
                ::deno_run::JsBundle::new(#js)
            }
        }
        .into()
    }
}
