# 015 — SPICE File Import for Component Library

Status: TODO — BLOCKED waiting for SPICE files from user

## Goal
Parse vendor SPICE model files (.lib, .sub, .sp) to automatically generate
component YAML definitions in `components/`. This replaces hand-authored component YAMLs.

## Background
The user will provide SPICE model files from component vendors (e.g. Texas Instruments,
Analog Devices, Vishay). Do NOT start this issue until the SPICE files are available.

## Planned approach
- New crate `eerie-spice-import` (binary) in the workspace
- Parse SPICE `.MODEL` and `.SUBCKT` statements
- Map SPICE model types to eerie component categories
- Generate `ComponentDef` YAML files in `components/` (grouped by manufacturer/category)
- Support SPICE primitives: R, C, L, D, Q (BJT), M (MOSFET), J (JFET), V, I
- Support subcircuits (.SUBCKT) → becomes a component with pins matching the subcircuit ports
- The generated netlist template uses the SPICE model name

## SPICE syntax to handle
```spice
.MODEL 2N2222 NPN (BF=255 ...)
.SUBCKT LM741 IN+ IN- V+ V- OUT
...
.ENDS LM741
```

## Acceptance criteria (once SPICE files are available)
- Import a vendor op-amp .lib → generates `components/opamps/lm741.yaml`
- Import a BJT model → generates `components/transistors/2n2222.yaml`
- Generated components appear in the ComponentPanel
- Generated SPICE netlist matches the expected subcircuit instantiation

## Do not start until
The user provides SPICE model files. Ask the user for these files when picking this issue.
If no SPICE files have been provided, skip to the next issue and leave this one open.
