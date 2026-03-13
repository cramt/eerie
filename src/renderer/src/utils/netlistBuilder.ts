import type { Circuit, ComponentInstance } from "../types";
import type {
  Netlist,
  Item,
  Expr,
  Source,
  Waveform,
  AcSpec,
  ElementKind,
  Analysis,
} from "../../../codegen/generated-rpc";
import { FILE_PIN_TO_UI, UI_PIN_TO_FILE } from "../pinDefs";

/** Map a file pin_id to a UI pin name */
export function filePinToUi(typeId: string, pinId: string): string {
  return FILE_PIN_TO_UI[typeId]?.[pinId] ?? pinId;
}

/** Map a UI pin name to a file pin_id */
export function uiPinToFile(typeId: string, pinName: string): string {
  return UI_PIN_TO_FILE[typeId]?.[pinName] ?? pinName;
}

function num(v: number): Expr {
  return { tag: "Num", value: v };
}

function unwrapPropertyFloat(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "Float" in val)
    return (val as { Float: number }).Float;
  return 0;
}

function unwrapPropertyString(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "String" in val)
    return (val as { String: string }).String;
  return "";
}

function optNum(props: Record<string, unknown>, key: string): Expr | null {
  if (!(key in props)) return null;
  return num(unwrapPropertyFloat(props[key]));
}

function buildSource(props: Record<string, unknown>, dcKey: string): Source {
  const sourceType = unwrapPropertyString(props.source_type ?? "DC");
  const dc: Expr | null = dcKey in props ? num(unwrapPropertyFloat(props[dcKey])) : null;

  let ac: AcSpec | null = null;
  if ("ac_mag" in props) {
    ac = {
      mag: num(unwrapPropertyFloat(props.ac_mag)),
      phase: optNum(props, "ac_phase"),
    };
  }

  let waveform: Waveform | null = null;
  switch (sourceType) {
    case "Pulse":
      waveform = {
        tag: "Pulse",
        v1: num(unwrapPropertyFloat(props.v1 ?? 0)),
        v2: num(unwrapPropertyFloat(props.v2 ?? 5)),
        td: optNum(props, "td"),
        tr: optNum(props, "tr"),
        tf: optNum(props, "tf"),
        pw: optNum(props, "pw"),
        per: optNum(props, "per"),
      };
      break;
    case "Sin":
      waveform = {
        tag: "Sin",
        v0: num(unwrapPropertyFloat(props.v0 ?? 0)),
        va: num(unwrapPropertyFloat(props.va ?? 1)),
        freq: optNum(props, "freq"),
        td: optNum(props, "td"),
        theta: optNum(props, "theta"),
        phi: optNum(props, "phi"),
      };
      break;
    case "Exp":
      waveform = {
        tag: "Exp",
        v1: num(unwrapPropertyFloat(props.v1 ?? 0)),
        v2: num(unwrapPropertyFloat(props.v2 ?? 5)),
        td1: optNum(props, "td1"),
        tau1: optNum(props, "tau1"),
        td2: optNum(props, "td2"),
        tau2: optNum(props, "tau2"),
      };
      break;
  }

  return { dc, ac, waveform };
}

/**
 * Build a mapping from net ID → SPICE node name (e.g. "n001", "0", "VCC").
 * Ground nets map to "0".
 */
export function buildNodeMap(circuit: Circuit): Map<string, string> {
  const netNodes = new Map<string, string>();
  for (const net of circuit.nets) {
    let isGround = false;
    for (const pin of net.pins) {
      const comp = circuit.components.find((c) => c.id === pin.component_id);
      if (comp?.type_id === "ground") { isGround = true; break; }
    }
    if (isGround) {
      netNodes.set(net.id, "0");
    } else {
      const label = net.labels?.[0]?.text;
      netNodes.set(net.id, label ?? net.id);
    }
  }
  return netNodes;
}

/**
 * Convert a UI Circuit into a typed SPICE Netlist for simulation.
 */
export function buildNetlist(circuit: Circuit, analysis: Analysis = { tag: 'Op' }): Netlist {
  // 1. Build node map: each net → SPICE node name
  const netNodes = buildNodeMap(circuit);

  // 2. Build pin→node lookup: (componentId, pinName) → node name
  const pinNode = new Map<string, string>();
  for (const net of circuit.nets) {
    const node = netNodes.get(net.id) ?? net.id;
    for (const pin of net.pins) {
      const comp = circuit.components.find((c) => c.id === pin.component_id);
      // Normalize pin name: file uses pin_id (p/n), UI uses symbol names
      const uiPinName = comp
        ? filePinToUi(comp.type_id, pin.pin_name)
        : pin.pin_name;
      pinNode.set(`${pin.component_id}:${uiPinName}`, node);
      // Also store under original pin_name for direct matches
      pinNode.set(`${pin.component_id}:${pin.pin_name}`, node);
    }
  }

  function node(compId: string, pinName: string): string {
    return (
      pinNode.get(`${compId}:${pinName}`) ?? `_unconnected_${compId}_${pinName}`
    );
  }

  // 3. Generate SPICE elements for each non-ground component
  const items: Item[] = [];

  for (const comp of circuit.components) {
    if (comp.type_id === "ground") continue;
    if (comp.type_id === "subcircuit") continue; // TODO: flatten subcircuit async

    const label = comp.label ?? comp.id;
    const element = buildElement(comp, label, node);
    if (element) {
      items.push({ tag: "Element", value: element });
    }
  }

  // 4. Add analysis command
  items.push({ tag: "Analysis", value: analysis });

  return {
    title: circuit.name,
    items,
  };

  function buildElement(
    comp: ComponentInstance,
    name: string,
    node: (id: string, pin: string) => string,
  ): { name: string; kind: ElementKind } | null {
    const props = comp.properties;
    switch (comp.type_id) {
      case "resistor": {
        const spiceName = name.toUpperCase().startsWith("R")
          ? name
          : `R${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "Resistor",
            pos: node(comp.id, "a"),
            neg: node(comp.id, "b"),
            value: num(unwrapPropertyFloat(props.resistance ?? 1000)),
            params: [],
          },
        };
      }
      case "capacitor": {
        const spiceName = name.toUpperCase().startsWith("C")
          ? name
          : `C${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "Capacitor",
            pos: node(comp.id, "a"),
            neg: node(comp.id, "b"),
            value: num(unwrapPropertyFloat(props.capacitance ?? 1e-6)),
            params: [],
          },
        };
      }
      case "inductor": {
        const spiceName = name.toUpperCase().startsWith("L")
          ? name
          : `L${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "Inductor",
            pos: node(comp.id, "a"),
            neg: node(comp.id, "b"),
            value: num(unwrapPropertyFloat(props.inductance ?? 1e-3)),
            params: [],
          },
        };
      }
      case "dc_voltage": {
        const spiceName = name.toUpperCase().startsWith("V")
          ? name
          : `V${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "VoltageSource",
            pos: node(comp.id, "positive"),
            neg: node(comp.id, "negative"),
            source: buildSource(props, "voltage"),
          },
        };
      }
      case "dc_current": {
        const spiceName = name.toUpperCase().startsWith("I")
          ? name
          : `I${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "CurrentSource",
            pos: node(comp.id, "positive"),
            neg: node(comp.id, "negative"),
            source: buildSource(props, "current"),
          },
        };
      }
      case "diode": {
        const spiceName = name.toUpperCase().startsWith("D")
          ? name
          : `D${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "Diode",
            anode: node(comp.id, "anode"),
            cathode: node(comp.id, "cathode"),
            model: "D",
            params: [],
          },
        };
      }
      case "npn":
      case "pnp": {
        const spiceName = name.toUpperCase().startsWith("Q")
          ? name
          : `Q${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "Bjt",
            c: node(comp.id, "collector"),
            b: node(comp.id, "base"),
            e: node(comp.id, "emitter"),
            substrate: null,
            model: comp.type_id === "npn" ? "NPN" : "PNP",
            params: [],
          },
        };
      }
      case "nmos":
      case "pmos": {
        const spiceName = name.toUpperCase().startsWith("M")
          ? name
          : `M${name}`;
        return {
          name: spiceName,
          kind: {
            tag: "Mosfet",
            d: node(comp.id, "drain"),
            g: node(comp.id, "gate"),
            s: node(comp.id, "source"),
            bulk: node(comp.id, "source"), // tie bulk to source by default
            body: null,
            model: comp.type_id === "nmos" ? "NMOS" : "PMOS",
            params: [],
          },
        };
      }
      default:
        return null;
    }
  }
}
