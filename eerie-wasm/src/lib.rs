#![cfg(target_arch = "wasm32")]
use eerie_rpc::{
    Capabilities, EerieService, EerieServiceDispatcher, FileContent, FileOpenRequest,
    FileSaveRequest, FileSaveResult,
};
use roam::DriverCaller;
use roam_inprocess::JsInProcessLink;
use thevenin_types::{Netlist, SimResult};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::js_sys;

#[derive(Clone)]
struct WasmService;

impl EerieService for WasmService {
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

    async fn get_capabilities(&self) -> Result<Capabilities, String> {
        Err("unsupported".to_string())
    }

    async fn file_open(&self, _: FileOpenRequest) -> Result<FileContent, String> {
        Err("unsupported".to_string())
    }

    async fn file_save(&self, _: FileSaveRequest) -> Result<FileSaveResult, String> {
        Err("unsupported".to_string())
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
