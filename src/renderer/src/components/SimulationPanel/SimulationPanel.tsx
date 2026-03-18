import React, { useRef, useEffect, useState, useCallback } from 'react'
import 'uplot/dist/uPlot.min.css'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useSimulationStore } from '../../store/simulationStore'
import { buildNetlist, buildNodeMap } from '../../utils/netlistBuilder'
import * as api from '../../api'
import { toastError } from '../../store/toastStore'
import { ConfigBar } from './ConfigBar'
import { OpTable } from './OpTable'
import { PlotResults } from './PlotResults'
import styles from './SimulationPanel.module.css'

// Re-export formatters for external consumers
export { formatSI, formatVecName } from './formatters'

export default function SimulationPanel() {
  const { simPanelOpen, toggleSimPanel } = useUiStore()
  const { circuit } = useCircuitStore()
  const { analysis, setAnalysis, result, setResult, error, setError, running, setRunning } =
    useSimulationStore()

  const [panelHeight, setPanelHeight] = useState(320)
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)

  const aType = analysis.tag

  const runSim = useCallback(async () => {
    if (running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const netNodeMap = buildNodeMap(circuit)
      const netlist = buildNetlist(circuit, analysis)
      const res = await api.simulate(netlist)
      if (!res.ok) {
        setError(res.error.message)
        toastError(`Simulation failed: ${res.error.message}`)
        return
      }
      setResult(res.value, netNodeMap)
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError(`Simulation error: ${msg}`)
    } finally {
      setRunning(false)
    }
  }, [circuit, analysis, running, setRunning, setError, setResult])

  // Expose runSim globally for F5 shortcut
  useEffect(() => {
    ;(window as any).__eerieRunSim = runSim
    return () => { delete (window as any).__eerieRunSim }
  }, [runSim])

  // Drag-to-resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = dragStartY.current - e.clientY
      setPanelHeight(Math.max(120, Math.min(window.innerHeight * 0.7, dragStartH.current + delta)))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onDragStart = (e: React.MouseEvent) => {
    dragging.current = true
    dragStartY.current = e.clientY
    dragStartH.current = panelHeight
    e.preventDefault()
  }

  if (!simPanelOpen) return null

  return (
    <div className={styles.panel} style={{ height: panelHeight }}>
      <div className={styles.dragHandle} onMouseDown={onDragStart} />
      <ConfigBar
        analysis={analysis}
        onChange={setAnalysis}
        onRun={runSim}
        running={running}
        onClose={toggleSimPanel}
      />
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.resultsArea}>
        {result && aType === 'Op' && <OpTable result={result} />}
        {result && aType !== 'Op' && (
          <PlotResults plots={result.plots} analysisType={aType} />
        )}
        {!result && !running && !error && (
          <div className={styles.emptyState}>
            Configure analysis above and press <kbd>F5</kbd> or <b>Run</b> to simulate.
          </div>
        )}
        {running && (
          <div className={styles.emptyState}>Running simulation...</div>
        )}
      </div>
    </div>
  )
}
