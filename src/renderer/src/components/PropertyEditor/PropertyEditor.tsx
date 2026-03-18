import React, { useState } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { SYMBOL_REGISTRY } from '../../symbols'
import { CircuitInfoPanel } from './CircuitInfoPanel'
import { PropertyRow } from './PropertyRow'
import { SourceTypeSelector } from './SourceTypeSelector'
import styles from './PropertyEditor.module.css'

const PROP_UNITS: Record<string, string> = {
  resistance: '\u03A9',
  capacitance: 'F',
  inductance: 'H',
  voltage: 'V',
  current: 'A',
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
