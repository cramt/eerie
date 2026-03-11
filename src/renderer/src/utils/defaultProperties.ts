/** Default property values for each component type. */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  resistor:    { resistance: 1000 },
  capacitor:   { capacitance: 1e-6 },
  inductor:    { inductance: 1e-3 },
  dc_voltage:  { voltage: 5, source_type: 'DC' },
  dc_current:  { current: 0.01, source_type: 'DC' },
  diode:       {},
  npn:         {},
  pnp:         {},
  nmos:        {},
  pmos:        {},
  opamp:       {},
  ground:      {},
}

/** Extra properties added when source_type changes. */
export const SOURCE_TYPE_DEFAULTS: Record<string, Record<string, unknown>> = {
  DC: {},
  Pulse: { v1: 0, v2: 5, td: 0, tr: 1e-9, tf: 1e-9, pw: 5e-6, per: 10e-6 },
  Sin: { v0: 0, va: 1, freq: 1000, td: 0, theta: 0, phi: 0 },
  Exp: { v1: 0, v2: 5, td1: 0, tau1: 1e-6, td2: 5e-6, tau2: 1e-6 },
}

export const SOURCE_TYPE_FIELDS: Record<string, string[]> = {
  DC: [],
  Pulse: ['v1', 'v2', 'td', 'tr', 'tf', 'pw', 'per'],
  Sin: ['v0', 'va', 'freq', 'td', 'theta', 'phi'],
  Exp: ['v1', 'v2', 'td1', 'tau1', 'td2', 'tau2'],
}

export function getDefaultProperties(typeId: string): Record<string, unknown> {
  return { ...(DEFAULTS[typeId] ?? {}) }
}
