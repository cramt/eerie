import React from 'react'
import { SOURCE_TYPE_DEFAULTS, SOURCE_TYPE_FIELDS } from '../../utils/defaultProperties'
import styles from './PropertyEditor.module.css'

const SOURCE_TYPES = ['DC', 'Pulse', 'Sin', 'Exp'] as const

export function SourceTypeSelector({
  compId,
  sourceType,
  properties,
  updateComponentProperty,
  updateComponent,
}: {
  compId: string
  sourceType: string
  properties: Record<string, unknown>
  updateComponentProperty: (id: string, key: string, val: unknown) => void
  updateComponent: (id: string, patch: Record<string, unknown>) => void
}) {
  const handleChange = (newType: string) => {
    // Remove old waveform-specific fields
    const oldFields = SOURCE_TYPE_FIELDS[sourceType] ?? []
    const newFields = SOURCE_TYPE_FIELDS[newType] ?? []
    const defaults = SOURCE_TYPE_DEFAULTS[newType] ?? {}

    const props: Record<string, unknown> = { ...properties, source_type: newType }
    for (const f of oldFields) {
      if (!newFields.includes(f)) delete props[f]
    }
    for (const f of newFields) {
      if (!(f in props)) props[f] = defaults[f] ?? 0
    }
    updateComponent(compId, { properties: props })
  }

  return (
    <div className={styles.row}>
      <span className={styles.key}>Source</span>
      <select
        className={styles.input}
        value={sourceType}
        onChange={(e) => handleChange(e.target.value)}
      >
        {SOURCE_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  )
}
