pub mod circuit;
pub mod component;
pub mod net;
pub mod simulation;
pub mod io;

pub use circuit::{Circuit, CircuitMetadata};
pub use component::{ComponentInstance, PropertyValue};
pub use net::{Net, WireSegment, Point};
pub use simulation::SimulationResult;

#[cfg(feature = "wasm")]
mod wasm_api;

#[cfg(feature = "wasm")]
pub use wasm_api::*;
