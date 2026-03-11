/**
 * Convert a typed Netlist to SPICE text for passing to the WASM simulator.
 *
 * This is the TypeScript equivalent of thevenin_types::Netlist::to_string().
 * Uses Facet's external tagging format.
 */
import type {
  Netlist,
  Item,
  Element,
  ElementKind,
  Expr,
  Source,
  Waveform,
  Analysis,
  Param,
} from "../../../codegen/types";

// ── Helpers for external-tagged enums ────────────────────────────────────────

/** Get the variant key of an externally-tagged union: "Op" | { Dc: ... } → "Op" | "Dc" */
function variantKey(val: string | Record<string, unknown>): string {
  if (typeof val === "string") return val;
  return Object.keys(val)[0];
}

/** Get the inner data of an externally-tagged union */
function variantData<T>(val: string | Record<string, T>): T | undefined {
  if (typeof val === "string") return undefined;
  return Object.values(val)[0];
}

function writeExpr(e: Expr): string {
  if ("Num" in e) return String(e.Num);
  if ("Param" in e) return e.Param;
  if ("Brace" in e) return `{${e.Brace}}`;
  return "0";
}

function writeParams(params: Param[]): string {
  if (params.length === 0) return "";
  return " " + params.map((p) => `${p.name}=${writeExpr(p.value)}`).join(" ");
}

function writeSource(source: Source): string {
  const parts: string[] = [];
  if (source.dc != null) {
    parts.push(writeExpr(source.dc));
  }
  if (source.ac != null) {
    const phase =
      source.ac.phase != null ? ` ${writeExpr(source.ac.phase)}` : "";
    parts.push(`AC ${writeExpr(source.ac.mag)}${phase}`);
  }
  if (source.waveform != null) {
    parts.push(writeWaveform(source.waveform));
  }
  return parts.join(" ");
}

function writeWaveform(w: Waveform): string {
  const key = variantKey(w as Record<string, unknown>);
  const d = variantData(w as Record<string, any>);
  switch (key) {
    case "Pulse": {
      const args = [writeExpr(d.v1), writeExpr(d.v2)];
      if (d.td != null) args.push(writeExpr(d.td));
      if (d.tr != null) args.push(writeExpr(d.tr));
      if (d.tf != null) args.push(writeExpr(d.tf));
      if (d.pw != null) args.push(writeExpr(d.pw));
      if (d.per != null) args.push(writeExpr(d.per));
      return `PULSE(${args.join(" ")})`;
    }
    case "Sin": {
      const args = [writeExpr(d.v0), writeExpr(d.va)];
      if (d.freq != null) args.push(writeExpr(d.freq));
      if (d.td != null) args.push(writeExpr(d.td));
      if (d.theta != null) args.push(writeExpr(d.theta));
      if (d.phi != null) args.push(writeExpr(d.phi));
      return `SIN(${args.join(" ")})`;
    }
    case "Exp": {
      const args = [writeExpr(d.v1), writeExpr(d.v2)];
      if (d.td1 != null) args.push(writeExpr(d.td1));
      if (d.tau1 != null) args.push(writeExpr(d.tau1));
      if (d.td2 != null) args.push(writeExpr(d.td2));
      if (d.tau2 != null) args.push(writeExpr(d.tau2));
      return `EXP(${args.join(" ")})`;
    }
    case "Pwl":
      return `PWL(${(d as any[]).map((p: any) => `${writeExpr(p.time)} ${writeExpr(p.value)}`).join(" ")})`;
    case "Sffm": {
      const args = [writeExpr(d.v0), writeExpr(d.va)];
      if (d.fc != null) args.push(writeExpr(d.fc));
      if (d.fs != null) args.push(writeExpr(d.fs));
      if (d.md != null) args.push(writeExpr(d.md));
      return `SFFM(${args.join(" ")})`;
    }
    case "Am": {
      const args = [
        writeExpr(d.va),
        writeExpr(d.vo),
        writeExpr(d.fc),
        writeExpr(d.fs),
      ];
      if (d.td != null) args.push(writeExpr(d.td));
      return `AM(${args.join(" ")})`;
    }
    default:
      return "";
  }
}

function writeElement(el: Element): string {
  const key = variantKey(el.kind as Record<string, unknown>);
  const k = variantData(el.kind as Record<string, any>)!;
  switch (key) {
    case "Resistor":
      return `${el.name} ${k.pos} ${k.neg} ${writeExpr(k.value)}${writeParams(k.params)}`;
    case "Capacitor":
      return `${el.name} ${k.pos} ${k.neg} ${writeExpr(k.value)}${writeParams(k.params)}`;
    case "Inductor":
      return `${el.name} ${k.pos} ${k.neg} ${writeExpr(k.value)}${writeParams(k.params)}`;
    case "VoltageSource":
      return `${el.name} ${k.pos} ${k.neg} ${writeSource(k.source)}`;
    case "CurrentSource":
      return `${el.name} ${k.pos} ${k.neg} ${writeSource(k.source)}`;
    case "Diode":
      return `${el.name} ${k.anode} ${k.cathode} ${k.model}${writeParams(k.params)}`;
    case "Bjt": {
      const sub = k.substrate != null ? ` ${k.substrate}` : "";
      return `${el.name} ${k.c} ${k.b} ${k.e}${sub} ${k.model}${writeParams(k.params)}`;
    }
    case "Mosfet":
      return `${el.name} ${k.d} ${k.g} ${k.s} ${k.bulk} ${k.model}${writeParams(k.params)}`;
    case "Jfet":
      return `${el.name} ${k.d} ${k.g} ${k.s} ${k.model}${writeParams(k.params)}`;
    case "Mesa":
      return `${el.name} ${k.d} ${k.g} ${k.s} ${k.model}${writeParams(k.params)}`;
    case "MutualCoupling":
      return `${el.name} ${k.l1} ${k.l2} ${writeExpr(k.coupling)}`;
    case "Vcvs":
      return `${el.name} ${k.out_pos} ${k.out_neg} ${k.in_pos} ${k.in_neg} ${writeExpr(k.gain)}`;
    case "Cccs":
      return `${el.name} ${k.out_pos} ${k.out_neg} ${k.vsrc} ${writeExpr(k.gain)}`;
    case "Vccs":
      return `${el.name} ${k.out_pos} ${k.out_neg} ${k.in_pos} ${k.in_neg} ${writeExpr(k.gm)}`;
    case "Ccvs":
      return `${el.name} ${k.out_pos} ${k.out_neg} ${k.vsrc} ${writeExpr(k.rm)}`;
    case "BehavioralSource":
      return `${el.name} ${k.pos} ${k.neg} ${k.spec}`;
    case "SubcktCall":
      return `${el.name} ${k.ports.join(" ")} ${k.subckt}${writeParams(k.params)}`;
    case "Ltra":
      return `${el.name} ${k.pos1} ${k.neg1} ${k.pos2} ${k.neg2} ${k.model}${writeParams(k.params)}`;
    case "Raw":
      return `${el.name} ${k}`;
    default:
      return "";
  }
}

function writeAnalysis(a: Analysis): string {
  const key = variantKey(a as any);
  if (key === "Op") return ".op";

  const d = variantData(a as Record<string, any>)!;
  switch (key) {
    case "Dc": {
      let line = `.dc ${d.src} ${writeExpr(d.start)} ${writeExpr(d.stop)} ${writeExpr(d.step)}`;
      if (d.src2 != null) {
        line += ` ${d.src2.src} ${writeExpr(d.src2.start)} ${writeExpr(d.src2.stop)} ${writeExpr(d.src2.step)}`;
      }
      return line;
    }
    case "Tran": {
      let line = `.tran ${writeExpr(d.tstep)} ${writeExpr(d.tstop)}`;
      if (d.tstart != null) line += ` ${writeExpr(d.tstart)}`;
      if (d.tmax != null) line += ` ${writeExpr(d.tmax)}`;
      return line;
    }
    case "Ac":
      return `.ac ${(d.variation as string).toLowerCase()} ${d.n} ${writeExpr(d.fstart)} ${writeExpr(d.fstop)}`;
    case "Noise":
      return `.noise V(${d.output}${d.ref_node != null ? `,${d.ref_node}` : ""}) ${d.src} ${(d.variation as string).toLowerCase()} ${d.n} ${writeExpr(d.fstart)} ${writeExpr(d.fstop)}`;
    case "Tf":
      return `.tf ${d.output} ${d.input}`;
    case "Sens":
      return `.sens ${d.output.join(" ")}`;
    case "Pz":
      return `.pz ${d.node_i} ${d.node_g} ${d.node_j} ${d.node_k} ${(d.input_type as string).toLowerCase()} ${(d.analysis_type as string).toLowerCase()}`;
    default:
      return "";
  }
}

function writeItem(item: Item): string {
  const key = variantKey(item as Record<string, unknown>);
  const d = variantData(item as Record<string, any>);
  switch (key) {
    case "Element":
      return writeElement(d);
    case "Subckt": {
      const s = d;
      const lines = [`.subckt ${s.name} ${s.ports.join(" ")}${writeParams(s.params)}`];
      for (const sub of s.items) lines.push(writeItem(sub));
      lines.push(".ends");
      return lines.join("\n");
    }
    case "Model":
      return `.model ${d.name} ${d.kind}${writeParams(d.params)}`;
    case "Analysis":
      return writeAnalysis(d);
    case "Param":
      return `.param ${(d as any[]).map((p: any) => `${p.name}=${writeExpr(p.value)}`).join(" ")}`;
    case "Include":
      return `.include ${d}`;
    case "Lib":
      return `.lib ${d.file}${d.entry != null ? ` ${d.entry}` : ""}`;
    case "Global":
      return `.global ${(d as string[]).join(" ")}`;
    case "Options":
      return `.options ${(d as any[]).map((p: any) => `${p.name}=${writeExpr(p.value)}`).join(" ")}`;
    case "Save":
      return `.save ${(d as string[]).join(" ")}`;
    case "Comment":
      return `* ${d}`;
    case "Raw":
      return d as string;
    default:
      return "";
  }
}

/** Convert a typed Netlist to SPICE text. */
export function netlistToSpice(netlist: Netlist): string {
  const lines = [netlist.title];
  for (const item of netlist.items) {
    lines.push(writeItem(item));
  }
  lines.push(".end");
  return lines.join("\n");
}
