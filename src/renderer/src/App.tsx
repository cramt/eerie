import React, { useEffect, useCallback, useState } from 'react'
import { useCircuitStore } from './store/circuitStore'
import { useUiStore } from './store/uiStore'
import { useProjectStore } from './store/projectStore'
import { useTabsStore } from './store/tabsStore'
import { useSimulationStore } from './store/simulationStore'
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
import Rail from './components/Rail/Rail'
import CommandPalette from './components/CommandPalette/CommandPalette'
import { toastError, toastSuccess } from './store/toastStore'
import { buildNetlist } from './utils/netlistBuilder'
import { parseCircuitYaml, serializeCircuitYaml } from './utils/circuitYaml'
import { netlistToSpice } from './utils/spiceWriter'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import * as api from './api'

import './themes/neon.css'
import './styles/global.css'

import type { Circuit } from './types'

export default function App() {
  const { circuit, setCircuit, projectPath, circuitName, setDirty } = useCircuitStore()
  const theme = useUiStore((s) => s.theme)
  const rails = useUiStore((s) => s.rails)
  const focusMode = useUiStore((s) => s.focusMode)
  const running = useSimulationStore((s) => s.running)
  const error = useSimulationStore((s) => s.error)
  const { setComponents, setComponentDefs } = useProjectStore()
  const { tabs, activeTabId, openTab, openTextTab, updateTextContent, closeTab } = useTabsStore()

  const [fileDialog, setFileDialog] = useState<{ mode: FileDialogMode } | null>(null)

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
      } catch { /* project dir may be empty */ }
    })
  }, [loadCircuit, setComponents, setComponentDefs])

  const handleOpen = useCallback(() => setFileDialog({ mode: 'open' }), [])

  const handleExportSpice = useCallback(() => {
    const analysis = useSimulationStore.getState().analysis
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
  }, [circuit, circuitName])

  const handleSave = useCallback(async () => {
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

  const handleNewTab = useCallback(() => setFileDialog({ mode: 'save' }), [])

  const handleFileDialogConfirm = useCallback(async (proj: string, circ: string) => {
    const mode = fileDialog?.mode
    setFileDialog(null)
    if (mode === 'open') {
      await loadCircuit(proj, circ)
    } else if (mode === 'save') {
      await saveCircuit(proj, circ)
    }
  }, [fileDialog, loadCircuit, saveCircuit])

  const handleFileDialogCancel = useCallback(() => setFileDialog(null), [])
  const handleCloseTab = useCallback((tabId: string) => closeTab(tabId), [closeTab])

  useKeyboardShortcuts({
    onSave: handleSave,
    onOpen: handleOpen,
    onNewTab: handleNewTab,
    onCloseTab: () => activeTabId && closeTab(activeTabId),
  })

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const aiState   = focusMode ? 'hidden' : rails.ai
  const filesState = focusMode ? 'hidden' : rails.files
  const compsState = focusMode ? 'hidden' : rails.components
  const propsState = focusMode ? 'hidden' : rails.props

  const canvasNoLeft  = compsState === 'hidden' && filesState === 'hidden'
  const canvasNoRight = propsState === 'hidden' && aiState === 'hidden'

  // Sim progress (0..1) — synthesised: 0.05 baseline while running so the hairline
  // is visible even before backends report progress; 1.0 when errored.
  const progress = error ? 1 : running ? 0.45 : 0
  const progressState = error ? 'errored' : running ? 'running' : 'idle'

  return (
    <div className="app-shell">
      {fileDialog && (
        <FileDialog
          mode={fileDialog.mode}
          currentProjectPath={projectPath ?? undefined}
          onConfirm={handleFileDialogConfirm}
          onCancel={handleFileDialogCancel}
        />
      )}

      <header className="app-shell__top">
        <Toolbar onOpen={handleOpen} onSave={handleSave} onExportSpice={handleExportSpice} />
      </header>

      <div className="app-shell__body">
        <Rail id="files" side="left" label="Files" glyph="F" shortcut="⌘1">
          <FileExplorer
            onOpenCircuit={loadCircuit}
            onOpenFile={loadTextFile}
            onNewCircuit={createAndOpenCircuit}
            onNewFile={createAndOpenFile}
          />
        </Rail>

        <Rail id="components" side="left" label="Components" glyph="C" shortcut="⌘2">
          <ComponentPanel />
        </Rail>

        <main
          className={
            'app-shell__canvas' +
            (canvasNoLeft  ? ' app-shell__canvas--no-left'  : '') +
            (canvasNoRight ? ' app-shell__canvas--no-right' : '')
          }
        >
          <div className="canvas-tabs">
            <TabBar onCloseTab={handleCloseTab} onNewTab={handleNewTab} />
          </div>
          <div className="canvas-stage">
            {activeTab?.kind === 'text' ? (
              <TextEditor
                fileName={activeTab.fileName}
                content={activeTab.content}
                onChange={(value) => updateTextContent(activeTab.id, value)}
                onSave={handleSave}
              />
            ) : activeTab ? (
              <Canvas onComponentDblClick={(compId) => {
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
            ) : (
              <div className="canvas-empty" data-mono>
                press ⌘T to start a new circuit, ⌘O to open one
              </div>
            )}
            <div
              className="canvas-progress"
              data-state={progressState}
              style={{ ['--progress' as 'opacity']: progress as unknown as string }}
            />
          </div>
          <div className="canvas-plot">
            <SimulationPanel />
          </div>
        </main>

        <Rail id="props" side="right" label="Properties" glyph="P" shortcut="⌘3">
          <PropertyEditor />
        </Rail>

        <Rail id="ai" side="right" label="AI Assistant" glyph="A" shortcut="⌘4">
          <AiChat />
        </Rail>
      </div>

      <footer className="app-shell__status">
        <StatusBar />
      </footer>

      <CommandPalette
        onOpenFile={handleOpen}
        onSave={handleSave}
        onExportSpice={handleExportSpice}
      />

      <ToastContainer />
    </div>
  )
}
