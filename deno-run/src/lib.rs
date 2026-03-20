use std::path::PathBuf;
use std::rc::Rc;
use std::sync::Arc;

use deno_core::{Extension, FastString, FsModuleLoader};
use deno_resolver::npm::DenoInNpmPackageChecker;
use deno_runtime::deno_fs::RealFs;
use deno_runtime::deno_permissions::PermissionsContainer;
use deno_runtime::permissions::RuntimePermissionDescriptorParser;
use deno_runtime::worker::{MainWorker, WorkerOptions, WorkerServiceOptions};
use node_resolver::errors::PackageFolderResolveError;
use node_resolver::{NpmPackageFolderResolver, UrlOrPathRef};
use sys_traits::impls::RealSys;

struct NoopNpmResolver;

impl NpmPackageFolderResolver for NoopNpmResolver {
    fn resolve_package_folder_from_package(
        &self,
        _specifier: &str,
        _referrer: &UrlOrPathRef,
    ) -> Result<PathBuf, PackageFolderResolveError> {
        unreachable!("npm resolution is not needed — bundle is pre-built by esbuild")
    }

    fn resolve_types_package_folder(
        &self,
        _types_package_name: &str,
        _maybe_package_version: Option<&deno_semver::Version>,
        _maybe_referrer: Option<&UrlOrPathRef>,
    ) -> Option<PathBuf> {
        None
    }
}

pub fn make_worker(extensions: Vec<Extension>) -> MainWorker {
    let fs = Arc::new(RealFs);
    let permission_desc_parser =
        Arc::new(RuntimePermissionDescriptorParser::new(RealSys));
    let main_module = deno_core::resolve_url("file:///main.js").unwrap();

    MainWorker::bootstrap_from_options::<DenoInNpmPackageChecker, NoopNpmResolver, RealSys>(
        &main_module,
        WorkerServiceOptions {
            module_loader: Rc::new(FsModuleLoader),
            permissions: PermissionsContainer::allow_all(permission_desc_parser),
            blob_store: Default::default(),
            broadcast_channel: Default::default(),
            feature_checker: Default::default(),
            node_services: Default::default(),
            npm_process_state_provider: Default::default(),
            root_cert_store_provider: Default::default(),
            fetch_dns_resolver: Default::default(),
            shared_array_buffer_store: Default::default(),
            compiled_wasm_module_store: Default::default(),
            v8_code_cache: Default::default(),
            bundle_provider: None,
            deno_rt_native_addon_loader: None,
            fs,
        },
        WorkerOptions {
            startup_snapshot: None,
            extensions,
            ..Default::default()
        },
    )
}

/// A pre-bundled JS payload produced by `deno_bundle::bundle!`.
/// Call `.run().await` to execute it inside a `deno_runtime` `MainWorker`.
pub struct JsBundle(pub &'static str);

impl JsBundle {
    pub const fn new(js: &'static str) -> Self {
        Self(js)
    }

    pub async fn run(self) {
        self.run_with_extensions(vec![]).await;
    }

    pub async fn run_with_extensions(self, extensions: Vec<Extension>) {
        let mut worker = make_worker(extensions);
        worker
            .execute_script("<main>", FastString::from_static(self.0))
            .unwrap();
        worker.run_event_loop(false).await.unwrap();
    }

    /// Execute the script, call `setup` with the worker (so the caller can
    /// inspect `OpState` after synchronous JS has run), then drive the event
    /// loop to completion.
    ///
    /// `setup` receives a `&mut MainWorker` immediately after the script is
    /// executed (and before any async JS resumes).  The return value of `setup`
    /// is forwarded to the caller once the event loop finishes.
    pub async fn run_with_setup<T, F>(
        self,
        extensions: Vec<Extension>,
        setup: F,
    ) -> T
    where
        F: FnOnce(&mut MainWorker) -> T,
    {
        let mut worker = make_worker(extensions);
        worker
            .execute_script("<main>", FastString::from_static(self.0))
            .unwrap();
        let result = setup(&mut worker);
        worker.run_event_loop(false).await.unwrap();
        result
    }
}

impl std::ops::Deref for JsBundle {
    type Target = str;
    fn deref(&self) -> &str {
        self.0
    }
}

/// An ES module payload produced by `deno_bundle::bundle!` with `--platform=node`.
///
/// Unlike `JsBundle` (classic script via `execute_script`), this writes the code
/// to a temp file and loads it as an ES module so that `import` statements work.
pub struct JsModule(pub &'static str);

impl JsModule {
    pub const fn new(js: &'static str) -> Self {
        Self(js)
    }

    /// Run a setup script (classic, synchronous) to prepare state (e.g. open a
    /// pipe), call `setup` to extract that state, then load and execute the ES
    /// module which uses it.
    ///
    /// `init_script` runs via `execute_script` (classic) — use it for sync ops
    /// like opening a pipe.  The module code should read shared state from
    /// `globalThis` rather than calling setup ops itself.
    pub async fn run_module_with_setup<T, F>(
        self,
        extensions: Vec<Extension>,
        init_script: &str,
        setup: F,
    ) -> T
    where
        F: FnOnce(&mut MainWorker) -> T,
    {
        let mut worker = make_worker(extensions);

        // Step 1: run the classic init script (synchronous).
        worker
            .execute_script("<init>", FastString::from(init_script.to_string()))
            .unwrap();

        // Step 2: let the caller inspect OpState (e.g. extract a HostPipe).
        let result = setup(&mut worker);

        // Step 3: write the ES module to a temp file and load it.
        let tmp = std::env::temp_dir().join("deno_run_module.mjs");
        std::fs::write(&tmp, self.0).unwrap();
        let specifier = deno_core::ModuleSpecifier::from_file_path(&tmp).unwrap();

        worker.execute_main_module(&specifier).await.unwrap();

        // Step 4: drive the event loop (module's async code runs here).
        let _ = worker.run_event_loop(false).await;

        let _ = std::fs::remove_file(&tmp);
        result
    }
}

impl std::ops::Deref for JsModule {
    type Target = str;
    fn deref(&self) -> &str {
        self.0
    }
}
