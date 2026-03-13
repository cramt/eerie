import React, { useEffect, useCallback, useRef, useState } from 'react'
import YAML from 'yaml'
import { useCircuitStore } from './store/circuitStore'
import { useUiStore } from './store/uiStore'
import { useHistoryStore } from './store/historyStore'
import { useProjectStore } from './store/projectStore'
import { useTabsStore } from './store/tabsStore'
import Toolbar from './components/Toolbar/Toolbar'
import Canvas from './components/Canvas/Canvas'
import ComponentPanel from './components/ComponentPanel/ComponentPanel'
import PropertyEditor from './components/PropertyEditor/PropertyEditor'
import SimulationPanel from './components/SimulationPanel/SimulationPanel'
import StatusBar from './components/StatusBar/StatusBar'
import FileDialog, { type FileDialogMode } from './components/FileDialog/FileDialog'
import TabBar from './components/TabBar/TabBar'
import FileExplorer from './components/FileExplorer/FileExplorer'
import TextEditor from './components/TextEditor/TextEditor'
import AiPanel from './components/AiPanel/AiPanel'
import { filePinToUi, uiPinToFile } from './utils/netlistBuilder'
import * as api from './api'
import { useAiStore } from './store/aiStore'

// Theme CSS
import './themes/neon.css'

import type { Circuit, ComponentInstance, Net } from './types'

export default function App() {
  const { circuit, setCircuit, projectPath, circuitName, dirty, setDirty } = useCircuitStore()
  const { theme, tool, setTool, setPlacingTypeId, selectedComponentIds, selectedNetIds, setSimPanelOpen, aiPanelOpen } = useUiStore()
  const { undo, redo } = useHistoryStore()
  const { setComponents } = useProjectStore()
  const { tabs, activeTabId, openTab, openTextTab, updateTextContent, closeTab } = useTabsStore()
  const { initDaemonKey } = useAiStore()

  // ── File dialog state ───────────────────────────────────────────────
  const [fileDialog, setFileDialog] = useState<{ mode: FileDialogMode } | null>(null)

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])


  // ── File operations ─────────────────────────────────────────────────

  const openProject = useCallback(async (proj: string) => {
    try {
      const caps = await api.getCapabilities()
      if (caps.file_io) {
        const info = await api.listProject(proj)
        setComponents(info.components)
      } else {
        setComponents(api.vfsGetProjectComponents(proj))
      }
    } catch {
      setComponents(null)
    }
  }, [setComponents])

  const loadCircuit = useCallback(async (proj: string, circ: string) => {
    try {
      await openProject(proj)
      const content = await api.readCircuit(proj, circ)
      const parsed = parseCircuitYaml(content)
      if (parsed) openTab(proj, circ, parsed)
    } catch (err) {
      console.error('Failed to open circuit:', err)
    }
  }, [openProject, openTab])

  const saveCircuit = useCallback(async (proj: string, circ: string) => {
    try {
      const yaml = serializeCircuitYaml(circuit)
      await api.saveCircuit(proj, circ, yaml)
      setCircuit(circuit, proj, circ)
      setDirty(false)
    } catch (err) {
      console.error('Failed to save circuit:', err)
    }
  }, [circuit, setCircuit, setDirty])

  const createAndOpenCircuit = useCallback(async (proj: string, circ: string) => {
    const displayName = circ.replace(/\.eerie$/, '')
    const newCircuit: Circuit = { name: displayName, components: [], nets: [] }
    try {
      const yaml = serializeCircuitYaml(newCircuit)
      await api.saveCircuit(proj, circ, yaml)
      openTab(proj, circ, newCircuit)
    } catch (err) {
      console.error('Failed to create circuit:', err)
    }
  }, [openTab])

  const createAndOpenFile = useCallback(async (proj: string, fileName: string) => {
    try {
      await api.writeFile(`${proj}/${fileName}`, '')
      openTextTab(proj, fileName, '')
    } catch (err) {
      console.error('Failed to create file:', err)
    }
  }, [openTextTab])

  const loadTextFile = useCallback(async (proj: string, fileName: string) => {
    try {
      const file = await api.readFile(`${proj}/${fileName}`)
      openTextTab(proj, fileName, file.content)
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }, [openTextTab])

  const saveTextTab = useCallback(async (tabId: string, proj: string, fileName: string, content: string) => {
    try {
      await api.writeFile(`${proj}/${fileName}`, content)
      useTabsStore.setState((s) => ({
        tabs: s.tabs.map((t) => t.id === tabId ? { ...t, dirty: false } : t),
      }))
    } catch (err) {
      console.error('Failed to save file:', err)
    }
  }, [])

  // Load daemon API key on startup
  useEffect(() => { initDaemonKey() }, [initDaemonKey])

  // Auto-open the daemon's project directory on startup (native mode)
  useEffect(() => {
    api.getProjectDir().then(async dir => {
      if (!dir) return
      try {
        const info = await api.listProject(dir)
        setComponents(info.components)
        useCircuitStore.setState({ projectPath: dir })
        if (info.circuits.length === 1) {
          await loadCircuit(dir, info.circuits[0])
        }
      } catch { /* project dir may be empty, that's fine */ }
    })
  }, [loadCircuit, setComponents])

  const handleOpen = useCallback(() => {
    setFileDialog({ mode: 'open' })
  }, [])

  const handleSave = useCallback(async () => {
    // Check if active tab is a text tab
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (activeTab?.kind === 'text') {
      await saveTextTab(activeTab.id, activeTab.projectPath, activeTab.fileName, activeTab.content)
      return
    }
    if (projectPath && circuitName) {
      await saveCircuit(projectPath, circuitName)
    } else {
      setFileDialog({ mode: 'save' })
    }
  }, [projectPath, circuitName, saveCircuit, saveTextTab, tabs, activeTabId])

  const handleFileDialogConfirm = useCallback(async (proj: string, circ: string) => {
    const mode = fileDialog?.mode
    setFileDialog(null)
    if (mode === 'open') {
      await loadCircuit(proj, circ)
    } else if (mode === 'save') {
      await saveCircuit(proj, circ)
    }
  }, [fileDialog, loadCircuit, saveCircuit])

  const handleFileDialogCancel = useCallback(() => {
    setFileDialog(null)
  }, [])

  const handleCloseTab = useCallback((tabId: string) => {
    closeTab(tabId)
  }, [closeTab])

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
    <div className="app-layout" data-ai-open={aiPanelOpen ? 'true' : undefined}>
      {fileDialog && (
        <FileDialog
          mode={fileDialog.mode}
          currentProjectPath={projectPath ?? undefined}
          onConfirm={handleFileDialogConfirm}
          onCancel={handleFileDialogCancel}
        />
      )}
      <div className="toolbar-area">
        <Toolbar onOpen={handleOpen} onSave={handleSave} />
      </div>
      <div className="panel-area">
        <div className="file-explorer-wrap">
          <FileExplorer
            onOpenCircuit={loadCircuit}
            onOpenFile={loadTextFile}
            onNewCircuit={createAndOpenCircuit}
            onNewFile={createAndOpenFile}
          />
        </div>
        <div className="component-panel-wrap">
          <ComponentPanel />
        </div>
      </div>
      <div className="tabs-area">
        <TabBar onCloseTab={handleCloseTab} />
      </div>
      <div className="canvas-area">
        {(() => {
          const activeTab = tabs.find((t) => t.id === activeTabId)
          if (activeTab?.kind === 'text') {
            return (
              <TextEditor
                fileName={activeTab.fileName}
                content={activeTab.content}
                onChange={(value) => updateTextContent(activeTab.id, value)}
                onSave={handleSave}
              />
            )
          }
          return <Canvas />
        })()}
      </div>
      <div className="plot-area">
        <SimulationPanel />
      </div>
      <div className="props-area">
        <PropertyEditor />
      </div>
      <div className="ai-area">
        {aiPanelOpen && <AiPanel />}
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

    // Parse parameters: plain number values from YAML
    const parameters: Record<string, number> = {}
    if (data.parameters && typeof data.parameters === 'object') {
      for (const [k, v] of Object.entries(data.parameters)) {
        if (typeof v === 'number') parameters[k] = v
      }
    }

    return {
      name: data.name ?? 'Untitled',
      ...(data.intent ? { intent: String(data.intent) } : {}),
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
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

  const data: Record<string, unknown> = {
    name: circuit.name,
    ...(circuit.intent ? { intent: circuit.intent } : {}),
    ...(circuit.parameters && Object.keys(circuit.parameters).length > 0
      ? { parameters: circuit.parameters }
      : {}),
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
