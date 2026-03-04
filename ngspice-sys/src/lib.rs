//! Raw FFI bindings to ngspice, compiled from vendored source.
//!
//! This crate exposes the C API defined in `ngspice/sharedspice.h` as unsafe
//! Rust FFI. ngspice is compiled from source and statically linked — no system
//! `libngspice.so` is needed at build time or runtime.
//!
//! # Usage
//!
//! Call [`ngSpice_Init`] once with your callback functions, then use
//! [`ngSpice_Command`] or [`ngSpice_Circ`] to interact with the simulator.
//!
//! # Targets
//!
//! Supports native targets and `wasm32-unknown-emscripten`.

#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
#![allow(dead_code)]
#![allow(clippy::all)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
