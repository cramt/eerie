import React, { useMemo } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useTabsStore, tabDisplayName } from '../../store/tabsStore'
import styles from './StatusBar.module.css'

const MODE_LABEL = {
  select: 'SELECT',
  wire:   'WIRE',
  place:  'PLACE',
} as const

function formatPath(p: string | null | undefined): string {
  if (!p) return '—'
  // Collapse $HOME → ~
  const home = '/home/'
  const idx = p.indexOf(home)
  if (idx === 0) {
    const rest = p.slice(home.length)
    const slash = rest.indexOf('/')
    return slash >= 0 ? '~' + rest.slice(slash) : '~/' + rest
  }
  return p
}

export default function StatusBar() {
  const tool = useUiStore((s) => s.tool)
  const chordPending = useUiStore((s) => s.chordPending)
  const aiRail = useUiStore((s) => s.rails.ai)
  const togglePalette = useUiStore((s) => s.togglePalette)
  const setRail = useUiStore((s) => s.setRail)
  const projectPath = useCircuitStore((s) => s.projectPath)
  const dirty = useCircuitStore((s) => s.dirty)
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const running = useSimulationStore((s) => s.running)
  const result = useSimulationStore((s) => s.result)
  const error = useSimulationStore((s) => s.error)
  const analysis = useSimulationStore((s) => s.analysis)

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  )

  const fileLabel = useMemo(() => {
    if (!activeTab) return projectPath ? formatPath(projectPath) + '/' : '—'
    const proj = formatPath(activeTab.projectPath)
    const name = tabDisplayName(activeTab)
    return `${proj}/${name}`
  }, [activeTab, projectPath])

  const isDirty = activeTab?.dirty ?? dirty

  // Sim state
  const simSegment = useMemo(() => {
    if (error) return { tone: 'warn' as const, glyph: '✕', text: error.split('\n')[0].slice(0, 60) }
    if (running) return { tone: 'signal' as const, glyph: '▶', text: `${analysis.tag} sweep` }
    if (result) {
      const elapsed = (result as unknown as { elapsed_ms?: number }).elapsed_ms
      const t = typeof elapsed === 'number' ? `${(elapsed / 1000).toFixed(2)}s` : 'ok'
      return { tone: 'probe' as const, glyph: '●', text: t }
    }
    return { tone: 'muted' as const, glyph: '○', text: 'idle' }
  }, [running, result, error, analysis.tag])

  return (
    <footer className={styles.bar}>
      <button
        type="button"
        className={styles.modeSeg}
        data-tone="signal"
        title={`Mode: ${MODE_LABEL[tool]} — Q/W/E to switch`}
      >
        <span data-mono className={styles.modeText}>
          {MODE_LABEL[tool]}
          {chordPending && tool === 'place' && (
            <>
              <span className={styles.chordArrow}> → </span>
              <span className={styles.chordCaret}>_</span>
            </>
          )}
        </span>
      </button>

      <div className={styles.seg} title="Active file">
        <span data-mono className={styles.fileText}>
          {fileLabel}
          {isDirty && <span className={styles.dirtyMark} aria-label="unsaved">*</span>}
        </span>
      </div>

      <div className={styles.spacer} />

      <button
        type="button"
        className={styles.seg}
        data-clickable="true"
        data-tone={simSegment.tone}
        title="Simulation status"
        onClick={() => useUiStore.getState().toggleSimPanel()}
      >
        <span data-mono className={styles.simGlyph}>{simSegment.glyph}</span>
        <span data-mono className={styles.simText}>{simSegment.text}</span>
      </button>

      <button
        type="button"
        className={styles.seg}
        data-clickable="true"
        title="Command palette  ⌘K"
        onClick={togglePalette}
      >
        <span data-mono className={styles.hintKey}>⌘K</span>
        <span className={styles.hintLabel}>palette</span>
      </button>

      <button
        type="button"
        className={styles.seg}
        data-clickable="true"
        data-tone={aiRail === 'full' ? 'signal' : 'muted'}
        title="AI assistant  ⌘4"
        onClick={() => setRail('ai', aiRail === 'full' ? 'hidden' : 'full')}
      >
        <span data-mono className={styles.hintKey}>⌘4</span>
        <span className={styles.hintLabel}>{aiRail === 'full' ? 'ai on' : 'ai'}</span>
      </button>
    </footer>
  )
}
