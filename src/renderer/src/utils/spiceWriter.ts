/**
 * Convert a typed Netlist to SPICE text for passing to the simulator.
 *
 * Uses roam's internal tagging format: { tag: 'Variant', ...fields }
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
} from "../../../codegen/generated-rpc";

function writeExpr(e: Expr): string {
  switch (e.tag) {
    case "Num":   return String(e.value);
    case "Param": return e.value;
    case "Brace": return `{${e.value}}`;
  }
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
    const phase = source.ac.phase != null ? ` ${writeExpr(source.ac.phase)}` : "";
    parts.push(`AC ${writeExpr(source.ac.mag)}${phase}`);
  }
  if (source.waveform != null) {
    parts.push(writeWaveform(source.waveform));
  }
  return parts.join(" ");
}

function writeWaveform(w: Waveform): string {
  switch (w.tag) {
    case "Pulse": {
      const args = [writeExpr(w.v1), writeExpr(w.v2)];
      if (w.td != null) args.push(writeExpr(w.td));
      if (w.tr != null) args.push(writeExpr(w.tr));
      if (w.tf != null) args.push(writeExpr(w.tf));
      if (w.pw != null) args.push(writeExpr(w.pw));
      if (w.per != null) args.push(writeExpr(w.per));
      return `PULSE(${args.join(" ")})`;
    }
    case "Sin": {
      const args = [writeExpr(w.v0), writeExpr(w.va)];
      if (w.freq != null) args.push(writeExpr(w.freq));
      if (w.td != null) args.push(writeExpr(w.td));
      if (w.theta != null) args.push(writeExpr(w.theta));
      if (w.phi != null) args.push(writeExpr(w.phi));
      return `SIN(${args.join(" ")})`;
    }
    case "Exp": {
      const args = [writeExpr(w.v1), writeExpr(w.v2)];
      if (w.td1 != null) args.push(writeExpr(w.td1));
      if (w.tau1 != null) args.push(writeExpr(w.tau1));
      if (w.td2 != null) args.push(writeExpr(w.td2));
      if (w.tau2 != null) args.push(writeExpr(w.tau2));
      return `EXP(${args.join(" ")})`;
    }
    case "Pwl":
      return `PWL(${w.value.map((p) => `${writeExpr(p.time)} ${writeExpr(p.value)}`).join(" ")})`;
    case "Sffm": {
      const args = [writeExpr(w.v0), writeExpr(w.va)];
      if (w.fc != null) args.push(writeExpr(w.fc));
      if (w.fs != null) args.push(writeExpr(w.fs));
      if (w.md != null) args.push(writeExpr(w.md));
      return `SFFM(${args.join(" ")})`;
    }
    case "Am": {
      const args = [writeExpr(w.va), writeExpr(w.vo), writeExpr(w.fc), writeExpr(w.fs)];
      if (w.td != null) args.push(writeExpr(w.td));
      return `AM(${args.join(" ")})`;
    }
  }
}

function writeElement(el: Element): string {
  const k: ElementKind = el.kind;
  switch (k.tag) {
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
    case "Raw":
      return `${el.name} ${k.value}`;
  }
}

function writeAnalysis(a: Analysis): string {
  switch (a.tag) {
    case "Op":
      return ".op";
    case "Dc": {
      let line = `.dc ${a.src} ${writeExpr(a.start)} ${writeExpr(a.stop)} ${writeExpr(a.step)}`;
      if (a.src2 != null) {
        line += ` ${a.src2.src} ${writeExpr(a.src2.start)} ${writeExpr(a.src2.stop)} ${writeExpr(a.src2.step)}`;
      }
      return line;
    }
    case "Tran": {
      let line = `.tran ${writeExpr(a.tstep)} ${writeExpr(a.tstop)}`;
      if (a.tstart != null) line += ` ${writeExpr(a.tstart)}`;
      if (a.tmax != null) line += ` ${writeExpr(a.tmax)}`;
      return line;
    }
    case "Ac":
      return `.ac ${a.variation.tag.toLowerCase()} ${a.n} ${writeExpr(a.fstart)} ${writeExpr(a.fstop)}`;
    case "Noise":
      return `.noise V(${a.output}${a.ref_node != null ? `,${a.ref_node}` : ""}) ${a.src} ${a.variation.tag.toLowerCase()} ${a.n} ${writeExpr(a.fstart)} ${writeExpr(a.fstop)}`;
    case "Tf":
      return `.tf ${a.output} ${a.input}`;
    case "Sens":
      return `.sens ${a.output.join(" ")}`;
    case "Pz":
      return `.pz ${a.node_i} ${a.node_g} ${a.node_j} ${a.node_k} ${a.input_type.tag.toLowerCase()} ${a.analysis_type.tag.toLowerCase()}`;
  }
}

function writeItem(item: Item): string {
  switch (item.tag) {
    case "Element":
      return writeElement(item.value);
    case "Subckt": {
      const s = item.value;
      const lines = [`.subckt ${s.name} ${s.ports.join(" ")}${writeParams(s.params)}`];
      for (const sub of s.items) lines.push(writeItem(sub));
      lines.push(".ends");
      return lines.join("\n");
    }
    case "Model":
      return `.model ${item.value.name} ${item.value.kind}${writeParams(item.value.params)}`;
    case "Analysis":
      return writeAnalysis(item.value);
    case "Param":
      return `.param ${item.value.map((p) => `${p.name}=${writeExpr(p.value)}`).join(" ")}`;
    case "Include":
      return `.include ${item.value}`;
    case "Lib":
      return `.lib ${item.file}${item.entry != null ? ` ${item.entry}` : ""}`;
    case "Global":
      return `.global ${item.value.join(" ")}`;
    case "Options":
      return `.options ${item.value.map((p) => `${p.name}=${writeExpr(p.value)}`).join(" ")}`;
    case "Save":
      return `.save ${item.value.join(" ")}`;
    case "Comment":
      return `* ${item.value}`;
    case "Raw":
      return item.value;
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
