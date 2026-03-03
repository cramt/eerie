//! Raw FFI bindings to the ngspice shared library.
//!
//! This crate exposes the C API defined in `ngspice/sharedspice.h` as unsafe
//! Rust FFI. For a safe, ergonomic wrapper see (future) `ngspice` crate.
//!
//! # Usage
//!
//! Call [`ngSpice_Init`] once with your callback functions, then use
//! [`ngSpice_Command`] or [`ngSpice_Circ`] to interact with the simulator.
//!
//! # Environment
//!
//! The crate is built against `libngspice.so`. In the Nix dev shell the path
//! is wired up automatically via `NGSPICE_LIB_DIR` / `NGSPICE_INCLUDE_DIR`.
//! At runtime `libngspice.so` must be on the dynamic linker search path
//! (`LD_LIBRARY_PATH` or rpath).

#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
#![allow(dead_code)]
#![allow(clippy::all)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
