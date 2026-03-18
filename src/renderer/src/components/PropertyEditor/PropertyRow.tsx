import React, { useState } from 'react'
import styles from './PropertyEditor.module.css'

const SUFFIXES: Record<string, number> = {
  't': 1e12, 'g': 1e9, 'meg': 1e6,
  'k': 1e3, '': 1,
  'm': 1e-3, 'mi': 1e-3, 'milli': 1e-3,
  'u': 1e-6, '\u00B5': 1e-6, 'micro': 1e-6,
  'n': 1e-9, 'p': 1e-12, 'f': 1e-15,
}

/** Parse engineering notation: "1k" -> 1000, "4.7u" -> 4.7e-6, etc. */
export function parseEngineering(raw: string): number | string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^([+-]?\d*\.?\d+)\s*([a-zA-Z\u00B5]*)$/)
  if (!match) {
    const num = Number(trimmed)
    return isNaN(num) ? trimmed : num
  }
  const num = parseFloat(match[1])
  if (isNaN(num)) return trimmed
  const suffix = match[2].toLowerCase()
  if (suffix in SUFFIXES) return num * SUFFIXES[suffix]
  // Strip unit letters (ohm, v, a, f, h) and check remaining prefix
  const stripped = suffix.replace(/[ohm|v|a|f|h|\u03A9]+$/i, '')
  if (stripped in SUFFIXES) return num * SUFFIXES[stripped]
  return num
}

/** Unwrap Facet-style property values: { Float: 1000 } → 1000, { String: "x" } → "x" */
export function unwrapFacet(val: unknown): unknown {
  if (val && typeof val === 'object') {
    if ('Float' in val) return (val as { Float: number }).Float
    if ('Int' in val) return (val as { Int: number }).Int
    if ('String' in val) return (val as { String: string }).String
    if ('Bool' in val) return (val as { Bool: boolean }).Bool
  }
  return val
}

export function formatValue(value: unknown, unit?: string): string {
  if (typeof value === 'number') {
    const abs = Math.abs(value)
    let str: string
    if (abs >= 1e9) str = `${(value as number / 1e9).toPrecision(3)}G`
    else if (abs >= 1e6) str = `${(value as number / 1e6).toPrecision(3)}M`
    else if (abs >= 1e3) str = `${(value as number / 1e3).toPrecision(3)}k`
    else if (abs >= 1) str = `${(value as number).toPrecision(3)}`
    else if (abs >= 1e-3) str = `${(value as number * 1e3).toPrecision(3)}m`
    else if (abs >= 1e-6) str = `${(value as number * 1e6).toPrecision(3)}\u00B5`
    else if (abs >= 1e-9) str = `${(value as number * 1e9).toPrecision(3)}n`
    else if (abs >= 1e-12) str = `${(value as number * 1e12).toPrecision(3)}p`
    else str = String(value)
    return unit ? `${str}${unit}` : str
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function PropertyRow({
  propKey,
  label,
  value,
  unit,
  onChange,
  onRemove,
}: {
  propKey: string
  label?: string
  value: unknown
  unit?: string
  onChange: (v: unknown) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  // Unwrap Facet-style values: { Float: 1000 } → 1000
  const unwrapped = unwrapFacet(value)
  const isNum = typeof unwrapped === 'number'
  const displayVal = isNum ? formatValue(unwrapped, unit) : String(unwrapped)

  const startEditing = () => {
    setEditValue(isNum ? String(unwrapped) : String(unwrapped))
    setEditing(true)
  }

  const commitEdit = () => {
    setEditing(false)
    const parsed = parseEngineering(editValue)
    if (parsed !== unwrapped) onChange(parsed)
  }

  return (
    <div className={styles.row}>
      <span className={styles.key}>{label ?? propKey}</span>
      {editing ? (
        <input
          className={styles.input}
          value={editValue}
          autoFocus
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className={styles.editableVal} onClick={startEditing}>
          {displayVal}
        </span>
      )}
      <button className={styles.removeBtn} onClick={onRemove} title="Remove property">&times;</button>
    </div>
  )
}
