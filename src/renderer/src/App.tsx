import React, { useEffect, useCallback, useState } from 'react'
import { useCircuitStore } from './store/circuitStore'
import { useUiStore } from './store/uiStore'
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
import ToastContainer from './components/Toast/Toast'
import AiChat from './components/AiChat/AiChat'
import { toastError, toastSuccess } from './store/toastStore'
import { buildNetlist } from './utils/netlistBuilder'
import { parseCircuitYaml, serializeCircuitYaml } from './utils/circuitYaml'
import { netlistToSpice } from './utils/spiceWriter'
import { useSimulationStore } from './store/simulationStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import * as api from './api'

// Theme CSS
import './themes/neon.css'

import type { Circuit } from './types'

export default function App() {
  const { circuit, setCircuit, projectPath, circuitName, dirty, setDirty } = useCircuitStore()
  const { theme, chatOpen } = useUiStore()
  const { analysis } = useSimulationStore()
  const { setComponents, setComponentDefs } = useProjectStore()
  const { tabs, activeTabId, openTab, openTextTab, updateTextContent, closeTab } = useTabsStore()

  // ── File dialog state ───────────────────────────────────────────────
  const [fileDialog, setFileDialog] = useState<{ mode: FileDialogMode } | null>(null)

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])


  // ── File operations ─────────────────────────────────────────────────

  const openProject = useCallback(async (proj: string) => {
    try {
      const info = await api.listProject(proj)
      setComponents(info.components)
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
      toastError(`Failed to open circuit: ${err}`)
    }
  }, [openProject, openTab])

  const saveCircuit = useCallback(async (proj: string, circ: string) => {
    try {
      const yaml = serializeCircuitYaml(circuit)
      await api.saveCircuit(proj, circ, yaml)
      setCircuit(circuit, proj, circ)
      setDirty(false)
      toastSuccess(`Saved ${circ}`)
    } catch (err) {
      console.error('Failed to save circuit:', err)
      toastError(`Failed to save: ${err}`)
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
      toastError(`Failed to create circuit: ${err}`)
    }
  }, [openTab])

  const createAndOpenFile = useCallback(async (proj: string, fileName: string) => {
    try {
      await api.writeFile(`${proj}/${fileName}`, '')
      openTextTab(proj, fileName, '')
    } catch (err) {
      console.error('Failed to create file:', err)
      toastError(`Failed to create file: ${err}`)
    }
  }, [openTextTab])

  const createAndOpenComponent = useCallback(async () => {
    const proj = useCircuitStore.getState().projectPath
    if (!proj) { toastError('Open a project first'); return }

    const raw = window.prompt('Component ID (e.g. my_sensor):')
    if (!raw) return
    const id = raw.trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '').toLowerCase()
    if (!id) { toastError('Invalid component ID'); return }
    const name = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    const template = `id: ${id}
name: ${name}
description: Custom ${name} component
category: custom
keywords: []

pins:
  - id: a
    name: A
    position: { x: -20, y: 0 }
    direction: left
    pin_type: passive
  - id: b
    name: B
    position: { x: 20, y: 0 }
    direction: right
    pin_type: passive

symbol:
  bounds: { x: -20, y: -10, width: 40, height: 20 }
  graphics:
    - kind: line
      x1: -20.0
      y1: 0.0
      x2: -8.0
      y2: 0.0
      stroke_width: 1.5
    - kind: rect
      x: -8.0
      y: -8.0
      width: 16.0
      height: 16.0
      stroke_width: 1.5
    - kind: line
      x1: 8.0
      y1: 0.0
      x2: 20.0
      y2: 0.0
      stroke_width: 1.5

properties:
  - id: value
    label: Value
    unit: ""
    property_type: float
    default: { Float: 1000.0 }

simulation:
  model_type: spice_primitive
  netlist: "R{label} {a} {b} {value}"
`
    const fileName = `components/${id}.yaml`
    try {
      await api.writeFile(`${proj}/${fileName}`, template)
      openTextTab(proj, fileName, template)
      toastSuccess(`Created ${fileName} — edit and save to add to library`)
    } catch (err) {
      console.error('Failed to create component:', err)
      toastError(`Failed to create component: ${err}`)
    }
  }, [openTextTab])

  const loadTextFile = useCallback(async (proj: string, fileName: string) => {
    try {
      const file = await api.readFile(`${proj}/${fileName}`)
      openTextTab(proj, fileName, file.content)
    } catch (err) {
      console.error('Failed to open file:', err)
      toastError(`Failed to open file: ${err}`)
    }
  }, [openTextTab])

  const saveTextTab = useCallback(async (tabId: string, proj: string, fileName: string, content: string) => {
    try {
      await api.writeFile(`${proj}/${fileName}`, content)
      useTabsStore.setState((s) => ({
        tabs: s.tabs.map((t) => t.id === tabId ? { ...t, dirty: false } : t),
      }))
      toastSuccess(`Saved ${fileName}`)
      // Reload component defs when a YAML file in components/ is saved
      if (fileName.startsWith('components/') && fileName.endsWith('.yaml')) {
        const defs = await api.listComponentDefs()
        setComponentDefs(defs)
        if (defs.length > 0) {
          setComponents(defs.map(def => ({
            name: def.name,
            type_id: def.id,
            properties: Object.fromEntries(def.properties.map(p => [p.id, p.default])),
          })))
        }
      }
    } catch (err) {
      console.error('Failed to save file:', err)
      toastError(`Failed to save file: ${err}`)
    }
  }, [setComponentDefs, setComponents])

  // Auto-open the daemon's project directory on startup (native mode)
  useEffect(() => {
    api.getProjectDir().then(async dir => {
      if (!dir) return
      try {
        const info = await api.listProject(dir)
        // Use manifest-defined components if present, otherwise load from
        // the workspace `components/` YAML files.
        if (info.components !== null) {
          setComponents(info.components)
        } else {
          const defs = await api.listComponentDefs()
          setComponentDefs(defs)
          if (defs.length > 0) {
            setComponents(defs.map(def => ({
              name: def.name,
              type_id: def.id,
              properties: Object.fromEntries(def.properties.map(p => [p.id, p.default])),
            })))
          } else {
            setComponents(null)
          }
        }
        useCircuitStore.setState({ projectPath: dir })
        if (info.circuits.length === 1) {
          await loadCircuit(dir, info.circuits[0])
        }
      } catch { /* project dir may be empty, that's fine */ }
    })
  }, [loadCircuit, setComponents, setComponentDefs])

  const handleOpen = useCallback(() => {
    setFileDialog({ mode: 'open' })
  }, [])

  const handleExportSpice = useCallback(() => {
    const netlist = buildNetlist(circuit, analysis)
    const text = netlistToSpice(netlist)
    const name = (circuitName ?? circuit.name ?? 'circuit').replace(/\.eerie$/, '')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.sp`
    a.click()
    URL.revokeObjectURL(url)
  }, [circuit, analysis, circuitName])

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
  useKeyboardShortcuts({ onSave: handleSave, onOpen: handleOpen })

  return (
    <div className="app-layout" data-ai-open={chatOpen ? "true" : undefined}>
      {fileDialog && (
        <FileDialog
          mode={fileDialog.mode}
          currentProjectPath={projectPath ?? undefined}
          onConfirm={handleFileDialogConfirm}
          onCancel={handleFileDialogCancel}
        />
      )}
      <div className="toolbar-area">
        <Toolbar onOpen={handleOpen} onSave={handleSave} onExportSpice={handleExportSpice} />
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
          return <Canvas onComponentDblClick={(compId) => {
            const comp = useCircuitStore.getState().circuit.components.find(c => c.id === compId)
            if (comp?.type_id === 'subcircuit') {
              const fileProp = comp.properties.file
              const filePath = typeof fileProp === 'string' ? fileProp
                : fileProp && typeof fileProp === 'object' && 'String' in fileProp ? (fileProp as { String: string }).String
                : null
              if (filePath && projectPath) {
                loadCircuit(projectPath, filePath)
              }
            }
          }} />
        })()}
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
      <div className="ai-area">
        {chatOpen && <AiChat />}
      </div>
      <ToastContainer />
    </div>
  )
}

