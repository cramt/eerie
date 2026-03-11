import type { PinDef } from "../types";
import { PIN_DEFINITIONS } from "../../../codegen/types";

import Resistor, { resistorPinPositions } from "./Resistor";
import Capacitor, { capacitorPinPositions } from "./Capacitor";
import Inductor, { inductorPinPositions } from "./Inductor";
import VoltageSource, { voltageSourcePinPositions } from "./VoltageSource";
import CurrentSource, { currentSourcePinPositions } from "./CurrentSource";
import Ground, { groundPinPositions } from "./Ground";
import Diode, { diodePinPositions } from "./Diode";
import NPN, { npnPinPositions } from "./NPN";
import PNP, { pnpPinPositions } from "./PNP";
import NMOS, { nmosPinPositions } from "./NMOS";
import PMOS, { pmosPinPositions } from "./PMOS";
import OpAmp, { opAmpPinPositions } from "./OpAmp";

export interface SymbolDef {
  component: React.FC<any>;
  pins: PinDef[];
  label: string;
  category: string;
  /** Offset (in pixels) for the label text relative to the component origin */
  labelOffset: { x: number; y: number };
  /** Offset (in pixels) for the value text relative to the component origin */
  valueOffset: { x: number; y: number };
}

/** Build PinDef[] from generated pin names + local positions. */
function buildPins(
  typeId: string,
  positions: Record<string, { x: number; y: number }>,
): PinDef[] {
  const defs = PIN_DEFINITIONS[typeId];
  if (!defs)
    return Object.entries(positions).map(([name, pos]) => ({ name, ...pos }));
  return defs.map((pin) => {
    const pos = positions[pin.name];
    if (!pos)
      throw new Error(`Missing position for pin "${pin.name}" on "${typeId}"`);
    return { name: pin.name, x: pos.x, y: pos.y };
  });
}

export const SYMBOL_REGISTRY: Record<string, SymbolDef> = {
  resistor: {
    component: Resistor,
    pins: buildPins("resistor", resistorPinPositions),
    label: "Resistor",
    category: "Passives",
    labelOffset: { x: -20, y: -22 },
    valueOffset: { x: -20, y: 12 },
  },
  capacitor: {
    component: Capacitor,
    pins: buildPins("capacitor", capacitorPinPositions),
    label: "Capacitor",
    category: "Passives",
    labelOffset: { x: -20, y: -26 },
    valueOffset: { x: -20, y: 18 },
  },
  inductor: {
    component: Inductor,
    pins: buildPins("inductor", inductorPinPositions),
    label: "Inductor",
    category: "Passives",
    labelOffset: { x: -20, y: -22 },
    valueOffset: { x: -20, y: 12 },
  },
  dc_voltage: {
    component: VoltageSource,
    pins: buildPins("dc_voltage", voltageSourcePinPositions),
    label: "DC Voltage",
    category: "Sources",
    labelOffset: { x: 24, y: -14 },
    valueOffset: { x: 24, y: 2 },
  },
  dc_current: {
    component: CurrentSource,
    pins: buildPins("dc_current", currentSourcePinPositions),
    label: "DC Current",
    category: "Sources",
    labelOffset: { x: 24, y: -14 },
    valueOffset: { x: 24, y: 2 },
  },
  ground: {
    component: Ground,
    pins: buildPins("ground", groundPinPositions),
    label: "Ground",
    category: "Symbols",
    labelOffset: { x: -20, y: 16 },
    valueOffset: { x: -20, y: 30 },
  },
  diode: {
    component: Diode,
    pins: buildPins("diode", diodePinPositions),
    label: "Diode",
    category: "Semiconductors",
    labelOffset: { x: -15, y: -24 },
    valueOffset: { x: -15, y: 16 },
  },
  npn: {
    component: NPN,
    pins: buildPins("npn", npnPinPositions),
    label: "NPN BJT",
    category: "Semiconductors",
    labelOffset: { x: -30, y: -38 },
    valueOffset: { x: -30, y: 28 },
  },
  pnp: {
    component: PNP,
    pins: buildPins("pnp", pnpPinPositions),
    label: "PNP BJT",
    category: "Semiconductors",
    labelOffset: { x: -30, y: -38 },
    valueOffset: { x: -30, y: 28 },
  },
  nmos: {
    component: NMOS,
    pins: buildPins("nmos", nmosPinPositions),
    label: "N-MOSFET",
    category: "Semiconductors",
    labelOffset: { x: -30, y: -40 },
    valueOffset: { x: -30, y: 32 },
  },
  pmos: {
    component: PMOS,
    pins: buildPins("pmos", pmosPinPositions),
    label: "P-MOSFET",
    category: "Semiconductors",
    labelOffset: { x: -30, y: -40 },
    valueOffset: { x: -30, y: 32 },
  },
  opamp: {
    component: OpAmp,
    pins: buildPins("opamp", opAmpPinPositions),
    label: "Op-Amp",
    category: "Semiconductors",
    labelOffset: { x: -10, y: -42 },
    valueOffset: { x: -10, y: 32 },
  },
};

// Group the registry by category for the component panel
export function getLibraryCategories(): {
  category: string;
  items: { id: string; label: string }[];
}[] {
  const catMap = new Map<string, { id: string; label: string }[]>();
  for (const [id, def] of Object.entries(SYMBOL_REGISTRY)) {
    const items = catMap.get(def.category) ?? [];
    items.push({ id, label: def.label });
    catMap.set(def.category, items);
  }
  return Array.from(catMap.entries()).map(([category, items]) => ({
    category,
    items,
  }));
}
