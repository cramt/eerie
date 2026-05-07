import React from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useHistoryStore } from '../../store/historyStore'
import { useSimulationStore } from '../../store/simulationStore'
import type { Tool } from '../../types'
import styles from './Toolbar.module.css'

interface Props {
  onOpen: () => void
  onSave: () => void
  onExportSpice: () => void
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'Q' },
  { id: 'wire',   label: 'Wire',   key: 'W' },
  { id: 'place',  label: 'Place',  key: 'E' },
]

export default function Toolbar({ onOpen, onSave, onExportSpice }: Props) {
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const togglePalette = useUiStore((s) => s.togglePalette)
  const dirty = useCircuitStore((s) => s.dirty)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)
  const undoStack = useHistoryStore((s) => s.undoStack)
  const redoStack = useHistoryStore((s) => s.redoStack)
  const running = useSimulationStore((s) => s.running)

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.brand}>
          <span className={styles.brandMark} aria-hidden>⌁</span>
          <span className={styles.brandText}>eerie</span>
        </span>

        <div className={styles.modeGroup} role="radiogroup" aria-label="Tool mode">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tool === t.id}
              className={styles.mode}
              data-active={tool === t.id ? 'true' : undefined}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
            >
              <span className={styles.modeDot} aria-hidden />
              <span className={styles.modeLabel}>{t.label.toLowerCase()}</span>
              <span className={styles.modeKey} data-mono>{t.key}</span>
            </button>
          ))}
        </div>

        <div className={styles.divider} aria-hidden />

        <button
          type="button"
          className={styles.iconBtn}
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo  ⌘Z"
          aria-label="Undo"
        >
          <span aria-hidden>↶</span>
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo  ⌘⇧Z"
          aria-label="Redo"
        >
          <span aria-hidden>↷</span>
        </button>
      </div>

      <div className={styles.center}>
        <button
          type="button"
          className={styles.palette}
          onClick={togglePalette}
          title="Command palette  ⌘K"
        >
          <span data-mono className={styles.palettePrompt}>⌘</span>
          <span className={styles.paletteLabel}>command palette</span>
          <span data-mono className={styles.paletteShortcut}>⌘K</span>
        </button>
      </div>

      <div className={styles.right}>
        <button
          type="button"
          className={styles.textBtn}
          onClick={onOpen}
          title="Open project  ⌘O"
        >
          open
        </button>
        <button
          type="button"
          className={styles.textBtn}
          onClick={onSave}
          disabled={!dirty}
          data-pulse={dirty ? 'true' : undefined}
          title="Save  ⌘S"
        >
          save
        </button>
        <button
          type="button"
          className={styles.textBtn}
          onClick={onExportSpice}
          title="Export SPICE netlist (.sp)"
        >
          export
        </button>
        <button
          type="button"
          className={styles.runBtn}
          data-running={running ? 'true' : undefined}
          onClick={() => {
            useUiStore.getState().setSimPanelOpen(true)
            ;(window as unknown as { __eerieRunSim?: () => void }).__eerieRunSim?.()
          }}
          title="Run simulation  F5"
        >
          <span className={styles.runDot} aria-hidden />
          <span>run</span>
          <span data-mono className={styles.runKey}>F5</span>
        </button>
      </div>
    </div>
  )
}
