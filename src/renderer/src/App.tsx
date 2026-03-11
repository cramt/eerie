import React, { useEffect, useCallback, useRef, useState } from 'react'
import YAML from 'yaml'
import { useCircuitStore } from './store/circuitStore'
import { useUiStore } from './store/uiStore'
import { useHistoryStore } from './store/historyStore'
import Toolbar from './components/Toolbar/Toolbar'
import Canvas from './components/Canvas/Canvas'
import ComponentPanel from './components/ComponentPanel/ComponentPanel'
import PropertyEditor from './components/PropertyEditor/PropertyEditor'
import SimulationPanel from './components/SimulationPanel/SimulationPanel'
import StatusBar from './components/StatusBar/StatusBar'
import FileDialog, { type FileDialogMode } from './components/FileDialog/FileDialog'
import { filePinToUi, uiPinToFile } from './utils/netlistBuilder'
import * as api from './api'

// Theme CSS
import './themes/neon.css'

import type { Circuit, ComponentInstance, Net } from './types'

export default function App() {
  const { circuit, setCircuit, filePath, dirty, setDirty } = useCircuitStore()
  const { theme, tool, setTool, setPlacingTypeId, selectedComponentIds, selectedNetIds, setSimPanelOpen, toggleSimPanel } = useUiStore()
  const { undo, redo } = useHistoryStore()

  // ── File dialog state ───────────────────────────────────────────────
  const [fileDialog, setFileDialog] = useState<{ mode: FileDialogMode; suggestedName?: string } | null>(null)

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // ── File operations ─────────────────────────────────────────────────

  const loadFile = useCallback(async (name: string) => {
    try {
      const file = await api.readFile(name)
      const parsed = parseCircuitYaml(file.content)
      if (parsed) setCircuit(parsed, file.path)
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }, [setCircuit])

  const saveToPath = useCallback(async (path: string) => {
    try {
      const yaml = serializeCircuitYaml(circuit)
      await api.writeFile(path, yaml)
      setCircuit(circuit, path)
      setDirty(false)
    } catch (err) {
      console.error('Failed to save file:', err)
    }
  }, [circuit, setCircuit, setDirty])

  const handleOpen = useCallback(() => {
    setFileDialog({ mode: 'open' })
  }, [])

  const handleSave = useCallback(async () => {
    if (filePath) {
      await saveToPath(filePath)
    } else {
      setFileDialog({ mode: 'save', suggestedName: 'circuit.eerie' })
    }
  }, [filePath, saveToPath])

  const handleFileDialogConfirm = useCallback(async (name: string) => {
    const mode = fileDialog?.mode
    setFileDialog(null)
    if (mode === 'open') {
      await loadFile(name)
    } else if (mode === 'save') {
      await saveToPath(name)
    }
  }, [fileDialog, loadFile, saveToPath])

  const handleFileDialogCancel = useCallback(() => {
    setFileDialog(null)
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  // Chord state: after pressing E, wait for a second key to pick a component
  const chordRef = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)

  // Place-chord map: E then <key> → component type_id (left-hand keys only)
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
      if (ctrl && e.key === 's') { e.preventDefault(); handleSave(); return }
      if (ctrl && e.key === 'o') { e.preventDefault(); handleOpen(); return }
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
  }, [undo, redo, handleSave, handleOpen, setTool, setPlacingTypeId,
      selectedComponentIds, selectedNetIds, setSimPanelOpen])

  return (
    <div className="app-layout">
      {fileDialog && (
        <FileDialog
          mode={fileDialog.mode}
          suggestedName={fileDialog.suggestedName}
          onConfirm={handleFileDialogConfirm}
          onCancel={handleFileDialogCancel}
        />
      )}
      <div className="toolbar-area">
        <Toolbar onOpen={handleOpen} onSave={handleSave} />
      </div>
      <div className="panel-area">
        <ComponentPanel />
      </div>
      <div className="canvas-area">
        <Canvas />
      </div>
      <div className="plot-area">
        <SimulationPanel />
      </div>
      <div className="props-area">
        <PropertyEditor />
      </div>
      <div className="status-area">
        <StatusBar />
      </div>
    </div>
  )
}

// ── YAML serialization for .eerie files ───────────────────────────────────

/** Unwrap Facet-style property values: { Float: 1000.0 } → 1000.0 */
function unwrapProperty(val: unknown): unknown {
  if (val && typeof val === 'object') {
    if ('Float' in val) return (val as { Float: number }).Float
    if ('Int' in val) return (val as { Int: number }).Int
    if ('String' in val) return (val as { String: string }).String
    if ('Bool' in val) return (val as { Bool: boolean }).Bool
  }
  return val
}

/** Wrap a plain value back into Facet-style property value */
function wrapProperty(val: unknown): unknown {
  if (typeof val === 'number') return { Float: val }
  if (typeof val === 'string') return { String: val }
  if (typeof val === 'boolean') return { Bool: val }
  return val
}

function parseCircuitYaml(content: string): Circuit | null {
  try {
    const data = YAML.parse(content)
    if (!data) return null

    const components: ComponentInstance[] = (data.components ?? []).map((c: any) => ({
      id: c.id ?? crypto.randomUUID(),
      type_id: c.type_id,
      label: c.label,
      position: c.position ?? { x: 0, y: 0 },
      rotation: c.rotation ?? 0,
      flip_x: c.flip_x ?? false,
      properties: Object.fromEntries(
        Object.entries(c.properties ?? {}).map(([k, v]) => [k, wrapProperty(v)])
      ),
    }))

    // Build a lookup for component type_id by id
    const compTypeById = new Map<string, string>()
    for (const comp of components) {
      compTypeById.set(comp.id, comp.type_id)
    }

    const nets: Net[] = (data.nets ?? []).map((n: any) => ({
      id: n.id ?? crypto.randomUUID(),
      segments: n.segments ?? [],
      pins: (n.pins ?? []).map((p: any) => {
        const typeId = compTypeById.get(p.component_id) ?? ''
        // Map file pin_id (p/n) → UI pin name (a/b, positive/negative)
        const pinName = filePinToUi(typeId, p.pin_id ?? p.pin_name ?? '')
        return { component_id: p.component_id, pin_name: pinName }
      }),
      labels: (n.labels ?? []).map((l: any) => ({
        text: l.name ?? l.text ?? '',
        position: l.position ?? { x: 0, y: 0 },
      })),
    }))

    return {
      name: data.name ?? 'Untitled',
      components,
      nets,
    }
  } catch (err) {
    console.error('Failed to parse circuit YAML:', err)
    return null
  }
}

function serializeCircuitYaml(circuit: Circuit): string {
  // Build a lookup for component type_id by id
  const compTypeById = new Map<string, string>()
  for (const comp of circuit.components) {
    compTypeById.set(comp.id, comp.type_id)
  }

  const data = {
    name: circuit.name,
    components: circuit.components.map(c => ({
      id: c.id,
      type_id: c.type_id,
      ...(c.label ? { label: c.label } : {}),
      position: c.position,
      ...(c.rotation ? { rotation: c.rotation } : {}),
      ...(c.flip_x ? { flip_x: c.flip_x } : {}),
      properties: Object.fromEntries(
        Object.entries(c.properties).map(([k, v]) => [k, unwrapProperty(v)])
      ),
    })),
    nets: circuit.nets.map(n => ({
      id: n.id,
      segments: n.segments,
      pins: n.pins.map(p => {
        const typeId = compTypeById.get(p.component_id) ?? ''
        return {
          component_id: p.component_id,
          pin_id: uiPinToFile(typeId, p.pin_name),
        }
      }),
      labels: n.labels.map(l => ({
        name: l.text,
        position: l.position,
      })),
    })),
  }
  return YAML.stringify(data)
}
