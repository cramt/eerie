//! Modified Nodal Analysis (MNA) — DC operating point solver.
//!
//! System:  [G  B] [V]   [I]
//!          [C  D] [J] = [E]
//!
//! G = conductance matrix, B/C from voltage sources,
//! V = node voltages, J = branch currents, I = injected currents, E = source voltages.

use nalgebra::{DMatrix, DVector};
use std::collections::HashMap;

use crate::circuit::Circuit;
use crate::component::ComponentInstance;
use crate::simulation::{AnalysisType, SimError, SimulationResult};

pub fn dc_analysis(circuit: &Circuit) -> Result<SimulationResult, SimError> {
    // ── 1. Node numbering (ground = 0, others = 1..n) ────────────────────────
    let node_map = build_node_map(circuit)?;
    let n_nodes = node_map.len();

    // ── 2. Collect voltage sources ────────────────────────────────────────────
    let vsources: Vec<_> = circuit
        .components
        .iter()
        .filter(|c| matches!(c.type_id.as_str(), "dc_voltage" | "vcc" | "battery"))
        .collect();
    let n_vs = vsources.len();
    let n = n_nodes + n_vs;

    if n == 0 {
        return Err(SimError::NoGround);
    }

    let mut g_mat = DMatrix::<f64>::zeros(n, n);
    let mut b_vec = DVector::<f64>::zeros(n);

    // ── 3. Stamp components ───────────────────────────────────────────────────
    for comp in &circuit.components {
        match comp.type_id.as_str() {
            "resistor" => {
                let r = comp.get_float("resistance").ok_or_else(|| {
                    SimError::MissingProperty("resistance".into(), comp.id.clone())
                })?;
                let (n1, n2) = two_terminal_nodes(circuit, comp, &node_map)?;
                stamp_resistor(&mut g_mat, n1, n2, r);
            }
            "capacitor" => {
                // Open circuit in DC — nothing to stamp
            }
            "inductor" => {
                // Short circuit in DC — near-zero resistance
                let (n1, n2) = two_terminal_nodes(circuit, comp, &node_map)?;
                stamp_resistor(&mut g_mat, n1, n2, 1e-9);
            }
            "dc_current" => {
                let i = comp.get_float("current").ok_or_else(|| {
                    SimError::MissingProperty("current".into(), comp.id.clone())
                })?;
                let (n_pos, n_neg) = two_terminal_nodes(circuit, comp, &node_map)?;
                if n_pos > 0 { b_vec[n_pos - 1] += i; }
                if n_neg > 0 { b_vec[n_neg - 1] -= i; }
            }
            _ => {}
        }
    }

    // ── 4. Stamp voltage sources ──────────────────────────────────────────────
    for (k, vs) in vsources.iter().enumerate() {
        let v = vs.get_float("voltage").ok_or_else(|| {
            SimError::MissingProperty("voltage".into(), vs.id.clone())
        })?;
        let (n_pos, n_neg) = two_terminal_nodes(circuit, vs, &node_map)?;
        let ki = n_nodes + k;

        if n_pos > 0 { g_mat[(n_pos - 1, ki)] += 1.0; g_mat[(ki, n_pos - 1)] += 1.0; }
        if n_neg > 0 { g_mat[(n_neg - 1, ki)] -= 1.0; g_mat[(ki, n_neg - 1)] -= 1.0; }
        b_vec[ki] = v;
    }

    // ── 5. Solve ──────────────────────────────────────────────────────────────
    let solution = g_mat.lu().solve(&b_vec).ok_or(SimError::SingularMatrix)?;

    // ── 6. Results ────────────────────────────────────────────────────────────
    let mut node_voltages = HashMap::new();
    node_voltages.insert("GND".to_string(), 0.0);
    for (name, &idx) in &node_map {
        node_voltages.insert(name.clone(), solution[idx - 1]);
    }

    let mut branch_currents = HashMap::new();
    for (k, vs) in vsources.iter().enumerate() {
        let label = vs.label.clone().unwrap_or_else(|| format!("V{}", k + 1));
        branch_currents.insert(label, solution[n_nodes + k]);
    }

    Ok(SimulationResult {
        node_voltages,
        branch_currents,
        converged: true,
        analysis_type: AnalysisType::Dc,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn stamp_resistor(g: &mut DMatrix<f64>, n1: usize, n2: usize, r: f64) {
    let gv = 1.0 / r;
    if n1 > 0 { g[(n1 - 1, n1 - 1)] += gv; }
    if n2 > 0 { g[(n2 - 1, n2 - 1)] += gv; }
    if n1 > 0 && n2 > 0 {
        g[(n1 - 1, n2 - 1)] -= gv;
        g[(n2 - 1, n1 - 1)] -= gv;
    }
}

fn build_node_map(circuit: &Circuit) -> Result<HashMap<String, usize>, SimError> {
    let mut map = HashMap::new();
    let mut idx = 1usize;

    let ground_id = find_ground_net(circuit).ok_or(SimError::NoGround)?;

    for net in &circuit.nets {
        if net.id == ground_id { continue; }
        let name = net.name.clone().unwrap_or_else(|| format!("N_{}", &net.id[..8]));
        map.insert(name, idx);
        idx += 1;
    }
    Ok(map)
}

fn find_ground_net(circuit: &Circuit) -> Option<String> {
    for net in &circuit.nets {
        if matches!(net.name.as_deref(), Some("GND") | Some("0")) {
            return Some(net.id.clone());
        }
        // Ground if it connects to a "ground" type symbol
        let has_gnd_sym = net.pins.iter().any(|p| {
            circuit.component_by_id(&p.component_id)
                .map(|c| c.type_id == "ground")
                .unwrap_or(false)
        });
        if has_gnd_sym {
            return Some(net.id.clone());
        }
    }
    None
}

fn two_terminal_nodes(
    circuit: &Circuit,
    comp: &ComponentInstance,
    node_map: &HashMap<String, usize>,
) -> Result<(usize, usize), SimError> {
    let n_pos = node_for_pin(circuit, comp, "p", node_map);
    let n_neg = node_for_pin(circuit, comp, "n", node_map);
    Ok((n_pos, n_neg))
}

fn node_for_pin(
    circuit: &Circuit,
    comp: &ComponentInstance,
    pin_id: &str,
    node_map: &HashMap<String, usize>,
) -> usize {
    for net in &circuit.nets {
        let connected = net.pins.iter().any(|p| p.component_id == comp.id && p.pin_id == pin_id);
        if !connected { continue; }

        if matches!(net.name.as_deref(), Some("GND") | Some("0")) {
            return 0;
        }
        let is_ground = net.pins.iter().any(|p| {
            circuit.component_by_id(&p.component_id)
                .map(|c| c.type_id == "ground")
                .unwrap_or(false)
        });
        if is_ground { return 0; }

        let name = net.name.clone().unwrap_or_else(|| format!("N_{}", &net.id[..8]));
        return *node_map.get(&name).unwrap_or(&0);
    }
    0 // floating pin → ground
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::circuit::Circuit;
    use crate::component::{ComponentInstance, PropertyValue};
    use crate::net::{Net, PinRef};

    /// Voltage divider: 5V → R1=1kΩ → R2=2kΩ → GND
    /// V(VMID) = 5 × 2000/3000 ≈ 3.333 V
    #[test]
    fn test_voltage_divider() {
        let mut circuit = Circuit::new("test_divider");

        let mut vs = ComponentInstance::new("dc_voltage", 0, 0);
        vs.label = Some("V1".into());
        vs.properties.insert("voltage".into(), PropertyValue::Float(5.0));

        let mut r1 = ComponentInstance::new("resistor", 2, 0);
        r1.label = Some("R1".into());
        r1.properties.insert("resistance".into(), PropertyValue::Float(1000.0));

        let mut r2 = ComponentInstance::new("resistor", 4, 0);
        r2.label = Some("R2".into());
        r2.properties.insert("resistance".into(), PropertyValue::Float(2000.0));

        let gnd_sym = ComponentInstance::new("ground", 6, 0);

        let (vs_id, r1_id, r2_id, gnd_id) =
            (vs.id.clone(), r1.id.clone(), r2.id.clone(), gnd_sym.id.clone());

        circuit.components = vec![vs, r1, r2, gnd_sym];

        let mut vin = Net::named("VIN");
        vin.pins = vec![
            PinRef { component_id: vs_id.clone(), pin_id: "p".into() },
            PinRef { component_id: r1_id.clone(), pin_id: "p".into() },
        ];
        let mut vmid = Net::named("VMID");
        vmid.pins = vec![
            PinRef { component_id: r1_id, pin_id: "n".into() },
            PinRef { component_id: r2_id.clone(), pin_id: "p".into() },
        ];
        let mut gnd_net = Net::named("GND");
        gnd_net.pins = vec![
            PinRef { component_id: vs_id, pin_id: "n".into() },
            PinRef { component_id: r2_id, pin_id: "n".into() },
            PinRef { component_id: gnd_id, pin_id: "p".into() },
        ];
        circuit.nets = vec![vin, vmid, gnd_net];

        let result = dc_analysis(&circuit).expect("simulation should converge");

        let v_in = result.node_voltages["VIN"];
        let v_mid = result.node_voltages["VMID"];

        assert!((v_in - 5.0).abs() < 1e-9, "VIN = {v_in}");
        assert!((v_mid - 10.0 / 3.0).abs() < 1e-6, "VMID = {v_mid}");
    }
}
