import React, { useState } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { SYMBOL_REGISTRY } from '../../symbols'
import { SOURCE_TYPE_DEFAULTS, SOURCE_TYPE_FIELDS } from '../../utils/defaultProperties'
import styles from './PropertyEditor.module.css'

// ── Circuit info panel (shown when nothing is selected) ───────────────────

function CircuitInfoPanel() {
  const { circuit, setCircuitName, setCircuitIntent, setParameter, removeParameter } = useCircuitStore()
  const [addingParam, setAddingParam] = useState(false)
  const [newParamKey, setNewParamKey] = useState('')
  const [newParamVal, setNewParamVal] = useState('0')

  const handleAddParam = () => {
    const key = newParamKey.trim()
    const val = parseFloat(newParamVal)
    if (key && !isNaN(val)) {
      setParameter(key, val)
      setNewParamKey('')
      setNewParamVal('0')
      setAddingParam(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Circuit</div>

      <div className={styles.section}>
        <div className={styles.row}>
          <span className={styles.key}>Name</span>
          <input
            className={styles.input}
            value={circuit.name}
            onChange={e => setCircuitName(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.sectionLabel}>Design Intent</div>
      <div className={styles.section}>
        <textarea
          className={styles.intentArea}
          value={circuit.intent ?? ''}
          placeholder="Describe what this circuit does and its design goals..."
          onChange={e => setCircuitIntent(e.target.value.trim() ? e.target.value : undefined)}
          rows={4}
        />
      </div>

      <div className={styles.sectionLabel}>Parameters</div>
      <div className={styles.section}>
        {Object.entries(circuit.parameters ?? {}).map(([k, v]) => (
          <div key={k} className={styles.row}>
            <span className={styles.key}>{k}</span>
            <input
              className={styles.input}
              type="number"
              defaultValue={v}
              onBlur={e => {
                const n = parseFloat(e.target.value)
                if (!isNaN(n)) setParameter(k, n)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <button
              className={styles.removeBtn}
              onClick={() => removeParameter(k)}
              title="Remove parameter"
            >
              &times;
            </button>
          </div>
        ))}

        {addingParam ? (
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder="name"
              value={newParamKey}
              autoFocus
              onChange={e => setNewParamKey(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddParam()
                if (e.key === 'Escape') { setAddingParam(false); setNewParamKey('') }
              }}
            />
            <input
              className={styles.input}
              type="number"
              placeholder="value"
              value={newParamVal}
              onChange={e => setNewParamVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddParam()
                if (e.key === 'Escape') { setAddingParam(false) }
              }}
            />
          </div>
        ) : (
          <button className={styles.addPropBtn} onClick={() => setAddingParam(true)}>
            + Add parameter
          </button>
        )}
      </div>
    </div>
  )
}

const PROP_UNITS: Record<string, string> = {
  resistance: '\u03A9',
  capacitance: 'F',
  inductance: 'H',
  voltage: 'V',
  current: 'A',
}

function formatValue(value: unknown, unit?: string): string {
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

/** Parse engineering notation: "1k" -> 1000, "4.7u" -> 4.7e-6, etc. */
function parseEngineering(raw: string): number | string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^([+-]?\d*\.?\d+)\s*([a-zA-Z\u00B5]*)$/)
  if (!match) {
    const num = Number(trimmed)
    return isNaN(num) ? trimmed : num
  }
  const num = parseFloat(match[1])
  if (isNaN(num)) return trimmed
  const suffix = match[2].toLowerCase()
  const multipliers: Record<string, number> = {
    't': 1e12, 'g': 1e9, 'meg': 1e6,
    'k': 1e3, '': 1,
    'm': 1e-3, 'mi': 1e-3, 'milli': 1e-3,
    'u': 1e-6, '\u00B5': 1e-6, 'micro': 1e-6,
    'n': 1e-9, 'p': 1e-12, 'f': 1e-15,
  }
  if (suffix in multipliers) return num * multipliers[suffix]
  // Strip unit letters (ohm, v, a, f, h) and check remaining prefix
  const stripped = suffix.replace(/[ohm|v|a|f|h|\u03A9]+$/i, '')
  if (stripped in multipliers) return num * multipliers[stripped]
  return num
}

/** Unwrap Facet-style property values: { Float: 1000 } → 1000, { String: "x" } → "x" */
function unwrapFacet(val: unknown): unknown {
  if (val && typeof val === 'object') {
    if ('Float' in val) return (val as { Float: number }).Float
    if ('Int' in val) return (val as { Int: number }).Int
    if ('String' in val) return (val as { String: string }).String
    if ('Bool' in val) return (val as { Bool: boolean }).Bool
  }
  return val
}

export default function PropertyEditor() {
  const { circuit, updateComponentProperty, updateComponent, removeComponent, removeComponents, removeNet, removeNets } = useCircuitStore()
  const { selectedComponentIds, selectedNetIds } = useUiStore()
  const { componentDefs } = useProjectStore()
  const [addingProp, setAddingProp] = useState(false)
  const [newPropKey, setNewPropKey] = useState('')

  const selectedComps = circuit.components.filter((c) => selectedComponentIds.has(c.id))
  const selectedNets = circuit.nets.filter((n) => selectedNetIds.has(n.id))

  if (selectedComps.length === 0 && selectedNets.length === 0) {
    return <CircuitInfoPanel />
  }

  if (selectedNets.length > 0 && selectedComps.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Properties</div>
        <div className={styles.section}>
          <div className={styles.row}>
            <span className={styles.key}>Type</span>
            <span className={styles.val}>Wire{selectedNets.length > 1 ? ` (${selectedNets.length})` : ''}</span>
          </div>
          {selectedNets.length === 1 && (
            <div className={styles.row}>
              <span className={styles.key}>Segments</span>
              <span className={styles.val}>{selectedNets[0].segments.length}</span>
            </div>
          )}
        </div>
        <div className={styles.controls}>
          <button
            className={`${styles.controlBtn} ${styles.deleteBtn}`}
            onClick={() => selectedNets.length === 1 ? removeNet(selectedNets[0].id) : removeNets([...selectedNetIds])}
            title="Delete (Del)"
          >
            Delete{selectedNets.length > 1 ? ' all' : ''}
          </button>
        </div>
      </div>
    )
  }

  if (selectedComps.length > 1) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Properties</div>
        <div className={styles.section}>
          <div className={styles.row}>
            <span className={styles.val}>{selectedComps.length} components selected</span>
          </div>
        </div>
        <div className={styles.controls}>
          <button
            className={`${styles.controlBtn} ${styles.deleteBtn}`}
            onClick={() => removeComponents([...selectedComponentIds])}
            title="Delete all (Del)"
          >
            Delete all
          </button>
        </div>
      </div>
    )
  }

  const comp = selectedComps[0]

  const sym = SYMBOL_REGISTRY[comp.type_id]
  const def = componentDefs[comp.type_id]
  const isSource = comp.type_id === 'dc_voltage' || comp.type_id === 'dc_current'
  const displayName = def?.name ?? sym?.label ?? comp.type_id

  const handleAddProperty = () => {
    const key = newPropKey.trim()
    if (key && !(key in comp.properties)) {
      updateComponentProperty(comp.id, key, 0)
      setNewPropKey('')
      setAddingProp(false)
    }
  }

  // Build property list: prefer ComponentDef ordering/labels, then fall back to raw keys
  const defPropIds = new Set(def?.properties.map(p => p.id) ?? [])
  const extraKeys = Object.keys(comp.properties).filter(k => k !== 'source_type' && !defPropIds.has(k))

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Properties</div>

      <div className={styles.section}>
        <div className={styles.row}>
          <span className={styles.key}>Type</span>
          <span className={styles.val}>{displayName}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>Label</span>
          <input
            className={styles.input}
            value={comp.label ?? ''}
            placeholder={displayName}
            onChange={(e) => updateComponent(comp.id, { label: e.target.value || undefined })}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.key}>Position</span>
          <span className={styles.val}>{comp.position.x}, {comp.position.y}</span>
        </div>
      </div>

      <div className={styles.sectionLabel}>Values</div>
      <div className={styles.section}>
        {isSource && (
          <SourceTypeSelector
            compId={comp.id}
            sourceType={String(comp.properties.source_type ?? 'DC')}
            properties={comp.properties}
            updateComponentProperty={updateComponentProperty}
            updateComponent={updateComponent}
          />
        )}
        {/* Render def-ordered properties with proper labels */}
        {def?.properties.map((propDef) => (
          <PropertyRow
            key={`${comp.id}-${propDef.id}`}
            propKey={propDef.id}
            label={propDef.label}
            value={comp.properties[propDef.id] ?? propDef.default}
            unit={propDef.unit ?? PROP_UNITS[propDef.id]}
            onChange={(v) => updateComponentProperty(comp.id, propDef.id, v)}
            onRemove={() => {
              const props = { ...comp.properties }
              delete props[propDef.id]
              updateComponent(comp.id, { properties: props })
            }}
          />
        ))}
        {/* Extra properties not in the def */}
        {extraKeys.map((key) => (
          <PropertyRow
            key={`${comp.id}-${key}`}
            propKey={key}
            value={comp.properties[key]}
            unit={PROP_UNITS[key]}
            onChange={(v) => updateComponentProperty(comp.id, key, v)}
            onRemove={() => {
              const props = { ...comp.properties }
              delete props[key]
              updateComponent(comp.id, { properties: props })
            }}
          />
        ))}
        {/* Legacy: no def, render all raw properties */}
        {!def && Object.entries(comp.properties)
          .filter(([key]) => key !== 'source_type')
          .map(([key, val]) => (
          <PropertyRow
            key={`${comp.id}-${key}`}
            propKey={key}
            value={val}
            unit={PROP_UNITS[key]}
            onChange={(v) => updateComponentProperty(comp.id, key, v)}
            onRemove={() => {
              const props = { ...comp.properties }
              delete props[key]
              updateComponent(comp.id, { properties: props })
            }}
          />
        ))}
        {Object.entries(comp.properties).length === 0 && !def && (
          <p className={styles.emptyProps}>No properties set.</p>
        )}

        {addingProp ? (
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder="property name"
              value={newPropKey}
              autoFocus
              onChange={(e) => setNewPropKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddProperty()
                if (e.key === 'Escape') { setAddingProp(false); setNewPropKey('') }
              }}
              onBlur={() => { if (!newPropKey.trim()) { setAddingProp(false) } }}
            />
          </div>
        ) : (
          <button
            className={styles.addPropBtn}
            onClick={() => setAddingProp(true)}
          >
            + Add property
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <button
          className={styles.controlBtn}
          onClick={() => updateComponent(comp.id, { rotation: (comp.rotation + 90) % 360 })}
          title="Rotate 90\u00B0 (R)"
        >
          Rotate
        </button>
        <button
          className={styles.controlBtn}
          onClick={() => updateComponent(comp.id, { flip_x: !comp.flip_x })}
          title="Flip horizontal"
        >
          Flip
        </button>
        <button
          className={`${styles.controlBtn} ${styles.deleteBtn}`}
          onClick={() => removeComponent(comp.id)}
          title="Delete (Del)"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function PropertyRow({
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

const SOURCE_TYPES = ['DC', 'Pulse', 'Sin', 'Exp'] as const

function SourceTypeSelector({
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
