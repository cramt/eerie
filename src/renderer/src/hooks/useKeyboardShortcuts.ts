import { useEffect, useRef, useCallback } from 'react'
import { useCircuitStore } from '../store/circuitStore'
import { useUiStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useSimulationStore } from '../store/simulationStore'

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

export function useKeyboardShortcuts({
  onSave,
  onOpen,
}: {
  onSave: () => void
  onOpen: () => void
}) {
  const { setTool, setPlacingTypeId, selectedComponentIds, selectedNetIds, setSimPanelOpen } =
    useUiStore()
  const { undo, redo } = useHistoryStore()

  const chordRef = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if focused on an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // F5 = run simulation (open panel if needed)
      if (e.key === 'F5') {
        e.preventDefault()
        setSimPanelOpen(true)
        ;(window as any).__eerieRunSim?.()
        return
      }

      // Handle second key of a chord
      if (chordRef.current && !ctrl) {
        const chord = chordRef.current
        clearTimeout(chord.timer)
        chordRef.current = null

        if (chord.key === 'e') {
          const typeId = PLACE_CHORDS[key]
          if (typeId) {
            setPlacingTypeId(typeId)
            setTool('place')
            return
          }
        }
        // If the second key didn't match a chord, fall through to handle it normally
      }

      if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return }
      if (ctrl && e.key === 'y') { e.preventDefault(); redo(); return }
      if (ctrl && e.key === 's') { e.preventDefault(); onSave(); return }
      if (ctrl && e.key === 'o') { e.preventDefault(); onOpen(); return }
      if (ctrl && key === 'a') {
        e.preventDefault()
        const { components, nets } = useCircuitStore.getState().circuit
        useUiStore.setState({
          selectedComponentIds: new Set(components.map(c => c.id)),
          selectedNetIds: new Set(nets.map(n => n.id)),
        })
        return
      }

      if (!ctrl) {
        if (key === 'q') { setTool('select'); return }
        if (key === 'w') { setTool('wire'); return }
        if (key === 'e') {
          // Start chord — wait for second key
          const timer = setTimeout(() => {
            chordRef.current = null
            // Timeout: just switch to place mode (old behavior)
            setTool('place')
          }, 500)
          chordRef.current = { key: 'e', timer }
          return
        }
        if (key === 'r') {
          if (selectedComponentIds.size > 0) {
            useCircuitStore.getState().rotateComponents([...selectedComponentIds])
          }
          return
        }
        if (key === 'f') {
          if (selectedComponentIds.size > 0) {
            useCircuitStore.getState().flipComponents([...selectedComponentIds])
          }
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedComponentIds.size > 0 || selectedNetIds.size > 0) {
            useCircuitStore.getState().deleteSelection([...selectedComponentIds], [...selectedNetIds])
          }
          return
        }
        if (e.key === 'Escape') {
          setTool('select')
          setPlacingTypeId(null)
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, onSave, onOpen, setTool, setPlacingTypeId,
      selectedComponentIds, selectedNetIds, setSimPanelOpen])
}
