import { useEffect, useRef } from 'react'
import { useCircuitStore } from '../store/circuitStore'
import { useUiStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useTabsStore } from '../store/tabsStore'

/** E → <key> chord map: left-hand keys → component type_id */
const PLACE_CHORDS: Record<string, string> = {
  r: 'resistor',
  c: 'capacitor',
  x: 'inductor',
  d: 'diode',
  v: 'dc_voltage',
  a: 'dc_current',
  g: 'ground',
  t: 'npn',
  f: 'nmos',
  w: 'opamp',
}

interface KeyboardOpts {
  onSave: () => void
  onOpen: () => void
  onNewTab: () => void
  onCloseTab: () => void
}

export function useKeyboardShortcuts({ onSave, onOpen, onNewTab, onCloseTab }: KeyboardOpts) {
  const setTool = useUiStore((s) => s.setTool)
  const setPlacingTypeId = useUiStore((s) => s.setPlacingTypeId)
  const setSimPanelOpen = useUiStore((s) => s.setSimPanelOpen)
  const cycleRail = useUiStore((s) => s.cycleRail)
  const togglePalette = useUiStore((s) => s.togglePalette)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode)
  const setChordPending = useUiStore((s) => s.setChordPending)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  const chordRef = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (useUiStore.getState().paletteOpen) { e.preventDefault(); setPaletteOpen(false); return }
        if (chordRef.current) {
          clearTimeout(chordRef.current.timer)
          chordRef.current = null
          setChordPending(false)
        }
        setTool('select')
        setPlacingTypeId(null)
        return
      }

      const target = e.target as HTMLElement | null
      const inEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false)

      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // ⌘K — palette is reachable even from inputs
      if (ctrl && key === 'k') { e.preventDefault(); togglePalette(); return }
      if (ctrl && e.shiftKey && key === 'p') { e.preventDefault(); togglePalette(); return }

      if (inEditable) return

      if (e.key === 'F5') {
        e.preventDefault()
        setSimPanelOpen(true)
        ;(window as unknown as { __eerieRunSim?: () => void }).__eerieRunSim?.()
        return
      }

      // Resolve pending chord
      if (chordRef.current && !ctrl) {
        const chord = chordRef.current
        clearTimeout(chord.timer)
        chordRef.current = null
        setChordPending(false)

        if (chord.key === 'e') {
          const typeId = PLACE_CHORDS[key]
          if (typeId) {
            setPlacingTypeId(typeId)
            setTool('place')
            return
          }
        }
      }

      if (ctrl) {
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
        if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return }
        if (key === 's') { e.preventDefault(); onSave(); return }
        if (key === 'o') { e.preventDefault(); onOpen(); return }
        if (key === 't') { e.preventDefault(); onNewTab(); return }
        if (key === 'w') { e.preventDefault(); onCloseTab(); return }
        if (key === 'a') {
          e.preventDefault()
          const { components, nets } = useCircuitStore.getState().circuit
          useUiStore.setState({
            selectedComponentIds: new Set(components.map(c => c.id)),
            selectedNetIds: new Set(nets.map(n => n.id)),
          })
          return
        }
        if (key === '1') { e.preventDefault(); cycleRail('files');      return }
        if (key === '2') { e.preventDefault(); cycleRail('components'); return }
        if (key === '3') { e.preventDefault(); cycleRail('props');      return }
        if (key === '4') { e.preventDefault(); cycleRail('ai');         return }
        if (key === '0') { e.preventDefault(); toggleFocusMode();        return }
        if (e.key === 'Tab') {
          e.preventDefault()
          const tabsState = useTabsStore.getState()
          const idx = tabsState.tabs.findIndex((t) => t.id === tabsState.activeTabId)
          if (idx < 0 || tabsState.tabs.length === 0) return
          const dir = e.shiftKey ? -1 : 1
          const next = (idx + dir + tabsState.tabs.length) % tabsState.tabs.length
          tabsState.switchToTab(tabsState.tabs[next].id)
          return
        }
      }

      if (!ctrl) {
        if (key === 'q') { setTool('select'); return }
        if (key === 'w') { setTool('wire');   return }
        if (key === 'e') {
          setChordPending(true)
          const timer = setTimeout(() => {
            chordRef.current = null
            setChordPending(false)
            setTool('place')
          }, 500)
          chordRef.current = { key: 'e', timer }
          return
        }
        if (key === 'r') {
          const sel = useUiStore.getState().selectedComponentIds
          if (sel.size > 0) useCircuitStore.getState().rotateComponents([...sel])
          return
        }
        if (key === 'f') {
          const sel = useUiStore.getState().selectedComponentIds
          if (sel.size > 0) useCircuitStore.getState().flipComponents([...sel])
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const ui = useUiStore.getState()
          if (ui.selectedComponentIds.size > 0 || ui.selectedNetIds.size > 0) {
            useCircuitStore.getState().deleteSelection([...ui.selectedComponentIds], [...ui.selectedNetIds])
          }
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    onSave, onOpen, onNewTab, onCloseTab,
    setTool, setPlacingTypeId, setSimPanelOpen,
    cycleRail, togglePalette, setPaletteOpen, toggleFocusMode, setChordPending,
    undo, redo,
  ])
}
