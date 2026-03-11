import React from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import type { Tool } from '../../types'
import styles from './Toolbar.module.css'

interface Props {
  onOpen: () => void
  onSave: () => void
}

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'select', label: 'Select', icon: '\u{1F5B1}', key: 'Q' },
  { id: 'wire',   label: 'Wire',   icon: '\u2501',    key: 'W' },
  { id: 'place',  label: 'Place',  icon: '\u2610',    key: 'E' },
]

export default function Toolbar({ onOpen, onSave }: Props) {
  const { tool, setTool, simPanelOpen, toggleSimPanel } = useUiStore()
  const { circuit, dirty } = useCircuitStore()

  const title = `${circuit.name}${dirty ? ' \u25CF' : ''}`

  return (
    <div className={styles.toolbar}>
      <span className={styles.logo}>Eerie</span>

      <div className={styles.tools}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`${styles.toolBtn} ${tool === t.id ? styles.active : ''}`}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key})`}
          >
            <span className={styles.toolIcon}>{t.icon}</span>
            <span className={styles.toolLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      <span className={styles.title}>{title}</span>

      <div className={styles.actions}>
        <button className={styles.btn} onClick={onOpen} title="Open (Ctrl+O)">
          Open
        </button>
        <button className={styles.btn} onClick={onSave} title="Save (Ctrl+S)">
          Save
        </button>
        <button
          className={`${styles.btn} ${styles.simBtn} ${simPanelOpen ? styles.simBtnActive : ''}`}
          onClick={toggleSimPanel}
          title="Simulation Panel (F5)"
        >
          Sim
        </button>
      </div>
    </div>
  )
}
