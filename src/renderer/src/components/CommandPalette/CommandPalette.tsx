import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useTabsStore } from '../../store/tabsStore'
import styles from './CommandPalette.module.css'

interface Command {
  id: string
  label: string
  /** Section header. */
  section: 'mode' | 'view' | 'file' | 'sim' | 'help'
  shortcut?: string
  run: () => void
}

interface Props {
  onOpenFile: () => void
  onSave: () => void
  onExportSpice: () => void
}

const SECTION_LABEL: Record<Command['section'], string> = {
  mode: 'Mode',
  view: 'View',
  file: 'File',
  sim: 'Simulation',
  help: 'Help',
}

const SECTION_ORDER: Command['section'][] = ['mode', 'file', 'sim', 'view', 'help']

export default function CommandPalette({ onOpenFile, onSave, onExportSpice }: Props) {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const setTool = useUiStore((s) => s.setTool)
  const cycleRail = useUiStore((s) => s.cycleRail)
  const toggleFocus = useUiStore((s) => s.toggleFocusMode)
  const setSimPanelOpen = useUiStore((s) => s.setSimPanelOpen)
  const closeTab = useTabsStore((s) => s.closeTab)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const commands = useMemo<Command[]>(() => [
    { id: 'mode-select',  section: 'mode', label: 'Switch to Select mode', shortcut: 'Q', run: () => setTool('select') },
    { id: 'mode-wire',    section: 'mode', label: 'Switch to Wire mode',   shortcut: 'W', run: () => setTool('wire') },
    { id: 'mode-place',   section: 'mode', label: 'Switch to Place mode',  shortcut: 'E', run: () => setTool('place') },
    { id: 'file-open',    section: 'file', label: 'Open project',          shortcut: '⌘O', run: onOpenFile },
    { id: 'file-save',    section: 'file', label: 'Save circuit',          shortcut: '⌘S', run: onSave },
    { id: 'file-export',  section: 'file', label: 'Export SPICE netlist',  run: onExportSpice },
    { id: 'tab-close',    section: 'file', label: 'Close active tab',      shortcut: '⌘W', run: () => activeTabId && closeTab(activeTabId) },
    { id: 'sim-run',      section: 'sim',  label: 'Run simulation',        shortcut: 'F5', run: () => {
      setSimPanelOpen(true)
      ;(window as unknown as { __eerieRunSim?: () => void }).__eerieRunSim?.()
    } },
    { id: 'sim-panel',    section: 'sim',  label: 'Toggle plot panel',     shortcut: 'F5', run: () => useUiStore.getState().toggleSimPanel() },
    { id: 'view-files',   section: 'view', label: 'Toggle Files rail',      shortcut: '⌘1', run: () => cycleRail('files') },
    { id: 'view-comps',   section: 'view', label: 'Toggle Components rail', shortcut: '⌘2', run: () => cycleRail('components') },
    { id: 'view-props',   section: 'view', label: 'Toggle Properties rail', shortcut: '⌘3', run: () => cycleRail('props') },
    { id: 'view-ai',      section: 'view', label: 'Toggle AI rail',         shortcut: '⌘4', run: () => cycleRail('ai') },
    { id: 'view-focus',   section: 'view', label: 'Toggle Focus mode',      shortcut: '⌘0', run: toggleFocus },
    { id: 'help-shortcuts', section: 'help', label: 'Show keyboard layer', run: () => { /* no-op for v1 */ } },
  ], [
    setTool, onOpenFile, onSave, onExportSpice, activeTabId, closeTab,
    setSimPanelOpen, cycleRail, toggleFocus,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) || c.section.includes(q),
    )
  }, [query, commands])

  const grouped = useMemo(() => {
    const map = new Map<Command['section'], Command[]>()
    for (const cmd of filtered) {
      const list = map.get(cmd.section) ?? []
      list.push(cmd)
      map.set(cmd.section, list)
    }
    const out: { section: Command['section']; items: Command[] }[] = []
    for (const section of SECTION_ORDER) {
      const items = map.get(section)
      if (items?.length) out.push({ section, items })
    }
    return out
  }, [filtered])

  // Reset state when opened.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  const close = () => setOpen(false)

  if (!open) return null

  const flat = filtered

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = flat[active]
      if (cmd) { cmd.run(); close() }
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={close}>
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.searchRow}>
          <span className={styles.searchPrompt} aria-hidden>{'⌘'}</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.search}
            placeholder="Run a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <button className={styles.escHint} onClick={close} aria-label="Close palette">
            <span data-mono>esc</span>
          </button>
        </div>

        <div className={styles.list} ref={listRef}>
          {grouped.length === 0 && (
            <div className={styles.empty}>nothing matches.</div>
          )}
          {grouped.map(({ section, items }) => (
            <div key={section} className={styles.group}>
              <div className={styles.groupLabel}>{SECTION_LABEL[section]}</div>
              {items.map((cmd) => {
                const idx = flat.indexOf(cmd)
                const isActive = idx === active
                return (
                  <button
                    key={cmd.id}
                    className={styles.item}
                    data-active={isActive ? 'true' : undefined}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { cmd.run(); close() }}
                  >
                    <span className={styles.itemLabel}>{cmd.label}</span>
                    {cmd.shortcut && (
                      <span className={styles.itemShortcut} data-mono>{cmd.shortcut}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
