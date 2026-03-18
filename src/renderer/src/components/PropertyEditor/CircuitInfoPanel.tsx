import React, { useState } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import styles from './PropertyEditor.module.css'

export function CircuitInfoPanel() {
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
