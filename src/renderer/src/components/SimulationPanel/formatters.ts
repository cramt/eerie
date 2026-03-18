export function formatSI(val: number): string {
  const abs = Math.abs(val)
  if (abs === 0) return '0'
  if (abs >= 1e9) return `${(val / 1e9).toPrecision(4)}G`
  if (abs >= 1e6) return `${(val / 1e6).toPrecision(4)}M`
  if (abs >= 1e3) return `${(val / 1e3).toPrecision(4)}k`
  if (abs >= 1) return `${val.toPrecision(4)}`
  if (abs >= 1e-3) return `${(val * 1e3).toPrecision(4)}m`
  if (abs >= 1e-6) return `${(val * 1e6).toPrecision(4)}\u00B5`
  if (abs >= 1e-9) return `${(val * 1e9).toPrecision(4)}n`
  if (abs >= 1e-12) return `${(val * 1e12).toPrecision(4)}p`
  return val.toExponential(3)
}

export function formatVecName(raw: string): string {
  const dotIdx = raw.indexOf('.')
  const name = dotIdx >= 0 ? raw.slice(dotIdx + 1) : raw
  if (name.endsWith('#branch')) {
    return `I(${name.slice(0, -7).toUpperCase()})`
  }
  const m = name.match(/^([vi])\((.+)\)$/i)
  if (m) return `${m[1].toUpperCase()}(${m[2].toUpperCase()})`
  return `V(${name.toUpperCase()})`
}
