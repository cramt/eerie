import React from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import styles from './StatusBar.module.css'

export default function StatusBar() {
  const { circuit } = useCircuitStore()
  const { zoom, mouseGridPos, tool, selectedComponentIds, selectedNetIds } = useUiStore()

  const compCount = selectedComponentIds.size
  const netCount = selectedNetIds.size
  const totalCount = compCount + netCount
  const selLabel = totalCount === 0
    ? null
    : compCount === 1 && netCount === 0
      ? (() => {
          const id = [...selectedComponentIds][0]
          const c = circuit.components.find(c => c.id === id)
          return c?.label ?? c?.type_id ?? ''
        })()
      : netCount === 1 && compCount === 0
        ? 'Wire'
        : `${totalCount} selected`

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.label}>Grid: 20px</span>
      </div>

      <div className={styles.center}>
        <span className={styles.label}>
          {tool === 'select' ? 'Select' : tool === 'wire' ? 'Wire' : 'Place'} mode
        </span>
        {selLabel && (
          <>
            <span className={styles.sep} />
            <span className={styles.label}>{selLabel}</span>
          </>
        )}
      </div>

      <div className={styles.right}>
        <span className={styles.label}>
          Pos: ({mouseGridPos.x}, {mouseGridPos.y})
        </span>
        <span className={styles.sep} />
        <span className={styles.label}>
          Zoom: {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  )
}
