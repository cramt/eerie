import React, { useRef, useEffect, useState, useCallback } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useSimulationStore } from '../../store/simulationStore'
import { buildNetlist, buildNodeMap } from '../../utils/netlistBuilder'
import * as api from '../../api'
import { toastError } from '../../store/toastStore'
import type { Analysis, Expr, SimPlot, SimResult, SimVector } from '../../../../codegen/generated-rpc'
import styles from './SimulationPanel.module.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get the numeric value from an Expr, or 0 if not a Num */
function exprNum(e: Expr | null | undefined): number {
  if (e && e.tag === 'Num') return e.value
  return 0
}

export function formatSI(val: number): string {
  const abs = Math.abs(val)
  if (abs === 0) return '0'
  if (abs >= 1e9) return `${(val / 1e9).toPrecision(4)}G`
  if (abs >= 1e6) return `${(val / 1e6).toPrecision(4)}M`
  if (abs >= 1e3) return `${(val / 1e3).toPrecision(4)}k`
  if (abs >= 1) return `${val.toPrecision(4)}`
  if (abs >= 1e-3) return `${(val * 1e3).toPrecision(4)}m`
  if (abs >= 1e-6) return `${(val * 1e6).toPrecision(4)}\u00B5`
  if (abs >= 1e-9) return `${(val * 1e9).toPrecision(4)}n`
  if (abs >= 1e-12) return `${(val * 1e12).toPrecision(4)}p`
  return val.toExponential(3)
}

export function formatVecName(raw: string): string {
  const dotIdx = raw.indexOf('.')
  const name = dotIdx >= 0 ? raw.slice(dotIdx + 1) : raw
  if (name.endsWith('#branch')) {
    return `I(${name.slice(0, -7).toUpperCase()})`
  }
  const m = name.match(/^([vi])\((.+)\)$/i)
  if (m) return `${m[1].toUpperCase()}(${m[2].toUpperCase()})`
  return `V(${name.toUpperCase()})`
}

const ANALYSIS_TYPES = ['Op', 'Tran', 'Ac', 'Dc'] as const
type AnalysisTypeName = (typeof ANALYSIS_TYPES)[number]

const COLORS = [
  '#00e5ff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8',
  '#ff922b', '#20c997', '#748ffc', '#f06595', '#a9e34b',
]

function findXVector(plot: SimPlot, aType: string): SimVector | undefined {
  if (aType === 'Tran')
    return plot.vecs.find((v) => v.name.toLowerCase().includes('time'))
  if (aType === 'Ac')
    return plot.vecs.find((v) => v.name.toLowerCase().includes('frequency'))
  if (aType === 'Dc') return plot.vecs[0]
  return undefined
}

function getVecData(vec: SimVector): number[] {
  if (vec.real.length > 0) return vec.real
  if (vec.complex.length > 0)
    return vec.complex.map((c) => Math.sqrt(c.re ** 2 + c.im ** 2))
  return []
}

function getXLabel(aType: string): string {
  switch (aType) {
    case 'Tran': return 'Time (s)'
    case 'Ac': return 'Frequency (Hz)'
    case 'Dc': return 'Sweep'
    default: return 'Index'
  }
}

function numExpr(v: number): Expr {
  return { tag: 'Num', value: v }
}

// ── Main panel ───────────────────────────────────────────────────────────────

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

// ── Config bar ───────────────────────────────────────────────────────────────

function ConfigBar({
  analysis, onChange, onRun, running, onClose,
}: {
  analysis: Analysis
  onChange: (a: Analysis) => void
  onRun: () => void
  running: boolean
  onClose: () => void
}) {
  const type = analysis.tag as AnalysisTypeName

  const setType = (t: AnalysisTypeName) => {
    switch (t) {
      case 'Op': onChange({ tag: 'Op' }); break
      case 'Tran': onChange({ tag: 'Tran', tstep: numExpr(1e-6), tstop: numExpr(1e-3), tstart: null, tmax: null }); break
      case 'Ac': onChange({ tag: 'Ac', variation: { tag: 'Dec' }, n: 10, fstart: numExpr(1), fstop: numExpr(1e6) }); break
      case 'Dc': onChange({ tag: 'Dc', src: 'V1', start: numExpr(0), stop: numExpr(5), step: numExpr(0.01), src2: null }); break
    }
  }

  return (
    <div className={styles.configBar}>
      <div className={styles.configLeft}>
        <div className={styles.analysisSelector}>
          {ANALYSIS_TYPES.map((t) => (
            <button
              key={t}
              className={`${styles.analysisBtn} ${type === t ? styles.analysisBtnActive : ''}`}
              onClick={() => setType(t)}
            >
              {t === 'Op' ? 'DC OP' : t === 'Tran' ? 'Transient' : t === 'Ac' ? 'AC' : 'DC Sweep'}
            </button>
          ))}
        </div>

        <AnalysisParams analysis={analysis} onChange={onChange} />
      </div>

      <div className={styles.configRight}>
        <button
          className={styles.runBtn}
          onClick={onRun}
          disabled={running}
          title="Run simulation (F5)"
        >
          {running ? 'Running\u2026' : '\u25B6 Run'}
        </button>
        <button className={styles.closeBtn} onClick={onClose} title="Close panel">
          {'\u2715'}
        </button>
      </div>
    </div>
  )
}

// ── Inline analysis params ───────────────────────────────────────────────────

function AnalysisParams({ analysis, onChange }: { analysis: Analysis; onChange: (a: Analysis) => void }) {
  if (analysis.tag === 'Op') return null

  if (analysis.tag === 'Tran') {
    return (
      <div className={styles.params}>
        <InlineField label="Step" value={analysis.tstep} onChange={(v) => onChange({ ...analysis, tstep: v ?? numExpr(0) })} />
        <InlineField label="Stop" value={analysis.tstop} onChange={(v) => onChange({ ...analysis, tstop: v ?? numExpr(0) })} />
        <InlineField label="Start" value={analysis.tstart} onChange={(v) => onChange({ ...analysis, tstart: v })} optional />
      </div>
    )
  }

  if (analysis.tag === 'Ac') {
    return (
      <div className={styles.params}>
        <div className={styles.paramGroup}>
          <span className={styles.paramLabel}>Var</span>
          <select
            className={styles.paramInput}
            value={analysis.variation.tag}
            onChange={(e) => onChange({ ...analysis, variation: { tag: e.target.value as 'Dec' | 'Oct' | 'Lin' } })}
          >
            <option value="Dec">Dec</option>
            <option value="Oct">Oct</option>
            <option value="Lin">Lin</option>
          </select>
        </div>
        <div className={styles.paramGroup}>
          <span className={styles.paramLabel}>Pts</span>
          <input
            className={styles.paramInput}
            type="number"
            value={analysis.n}
            style={{ width: 48 }}
            onChange={(e) => onChange({ ...analysis, n: parseInt(e.target.value) || 10 })}
          />
        </div>
        <InlineField label="f Start" value={analysis.fstart} onChange={(v) => onChange({ ...analysis, fstart: v ?? numExpr(0) })} />
        <InlineField label="f Stop" value={analysis.fstop} onChange={(v) => onChange({ ...analysis, fstop: v ?? numExpr(0) })} />
      </div>
    )
  }

  if (analysis.tag === 'Dc') {
    return (
      <div className={styles.params}>
        <div className={styles.paramGroup}>
          <span className={styles.paramLabel}>Src</span>
          <input
            className={styles.paramInput}
            value={analysis.src}
            style={{ width: 56 }}
            onChange={(e) => onChange({ ...analysis, src: e.target.value })}
          />
        </div>
        <InlineField label="Start" value={analysis.start} onChange={(v) => onChange({ ...analysis, start: v ?? numExpr(0) })} />
        <InlineField label="Stop" value={analysis.stop} onChange={(v) => onChange({ ...analysis, stop: v ?? numExpr(0) })} />
        <InlineField label="Step" value={analysis.step} onChange={(v) => onChange({ ...analysis, step: v ?? numExpr(0) })} />
      </div>
    )
  }

  return null
}

function InlineField({
  label, value, onChange, optional = false,
}: {
  label: string
  value: Expr | null | undefined
  onChange: (v: Expr | null) => void
  optional?: boolean
}) {
  const numVal = exprNum(value)
  const [text, setText] = useState(String(numVal))
  const [focused, setFocused] = useState(false)
  const displayVal = focused ? text : String(numVal)

  const commit = (raw: string) => {
    const v = parseFloat(raw)
    if (!isNaN(v)) onChange(numExpr(v))
    else if (optional && raw.trim() === '') onChange(null)
  }

  return (
    <div className={styles.paramGroup}>
      <span className={styles.paramLabel}>{label}</span>
      <input
        className={styles.paramInput}
        value={displayVal}
        placeholder={optional ? '\u2014' : ''}
        onFocus={() => { setText(String(numVal)); setFocused(true) }}
        onBlur={() => { commit(text); setFocused(false) }}
        onChange={(e) => { setText(e.target.value); commit(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(text); setFocused(false); (e.target as HTMLInputElement).blur() } }}
      />
    </div>
  )
}

// ── Op results table ─────────────────────────────────────────────────────────

function OpTable({ result }: { result: SimResult }) {
  const rows: { name: string; value: string; unit: string }[] = []
  for (const plot of result.plots) {
    for (const vec of plot.vecs) {
      const displayName = formatVecName(vec.name)
      const val = vec.real.length > 0 ? vec.real[0] : 0
      const isVoltage = displayName.startsWith('V(')
      const isCurrent = displayName.startsWith('I(')
      rows.push({
        name: displayName,
        value: formatSI(val),
        unit: isVoltage ? 'V' : isCurrent ? 'A' : '',
      })
    }
  }
  rows.sort((a, b) => {
    if (a.name.startsWith('V(') && !b.name.startsWith('V(')) return -1
    if (!a.name.startsWith('V(') && b.name.startsWith('V(')) return 1
    return a.name.localeCompare(b.name)
  })

  if (rows.length === 0) return <div className={styles.emptyState}>No results returned.</div>

  return (
    <table className={styles.opTable}>
      <thead>
        <tr>
          <th>Node</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.name}</td>
            <td className={styles.opValue}>{row.value} {row.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Plot results ─────────────────────────────────────────────────────────────

function PlotResults({ plots, analysisType }: { plots: SimPlot[]; analysisType: string }) {
  return (
    <>
      {plots.map((plot, i) => (
        <PlotView key={`${plot.name}-${i}`} plot={plot} analysisType={analysisType} />
      ))}
    </>
  )
}

function PlotView({ plot, analysisType }: { plot: SimPlot; analysisType: string }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)

  const xVec = findXVector(plot, analysisType)
  const yVecs = plot.vecs.filter((v) => v !== xVec)

  // Auto-select all voltage vectors on mount
  const [visibleVecs, setVisibleVecs] = useState<Set<number>>(() => {
    const initial = new Set<number>()
    yVecs.forEach((v, i) => {
      const name = formatVecName(v.name)
      if (name.startsWith('V(') || name.startsWith('I(')) initial.add(i)
    })
    // If nothing matched, select all
    if (initial.size === 0) yVecs.forEach((_, i) => initial.add(i))
    return initial
  })

  const toggleVec = (idx: number) => {
    setVisibleVecs((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const showAll = () => setVisibleVecs(new Set(yVecs.map((_, i) => i)))
  const hideAll = () => setVisibleVecs(new Set())

  useEffect(() => {
    if (!chartRef.current) return
    if (visibleVecs.size === 0) {
      if (uplotRef.current) { uplotRef.current.destroy(); uplotRef.current = null }
      return
    }

    const xData = xVec ? getVecData(xVec) : yVecs[0]?.real.map((_, i) => i) ?? []
    const selectedVecs = yVecs.filter((_, i) => visibleVecs.has(i))
    const data: uPlot.AlignedData = [
      new Float64Array(xData),
      ...selectedVecs.map((v) => new Float64Array(getVecData(v))),
    ]

    const isAc = analysisType === 'Ac'
    const isBode = isAc && selectedVecs.some((v) => v.complex.length > 0)

    const series: uPlot.Series[] = [
      { label: getXLabel(analysisType) },
      ...selectedVecs.map((v, i) => ({
        label: formatVecName(v.name),
        stroke: COLORS[i % COLORS.length],
        width: 1.5,
      })),
    ]

    if (isBode) {
      for (let si = 0; si < selectedVecs.length; si++) {
        const vec = selectedVecs[si]
        if (vec.complex.length > 0) {
          const magDb = new Float64Array(vec.complex.length)
          for (let j = 0; j < vec.complex.length; j++) {
            const mag = Math.sqrt(vec.complex[j].re ** 2 + vec.complex[j].im ** 2)
            magDb[j] = 20 * Math.log10(Math.max(mag, 1e-30))
          }
          data[si + 1] = magDb
        }
      }
    }

    const axisStyle = {
      stroke: 'rgba(136, 120, 170, 0.8)',
      grid: { stroke: 'rgba(42, 42, 68, 0.6)', width: 1 },
      ticks: { stroke: 'rgba(42, 42, 68, 0.8)', width: 1 },
      font: '11px JetBrains Mono, monospace',
    }

    const opts: uPlot.Options = {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight || 200,
      cursor: { drag: { x: true, y: true } },
      legend: { show: false },
      scales: { x: isAc ? { distr: 3 } : {} },
      axes: [
        { ...axisStyle, label: getXLabel(analysisType), labelFont: '11px JetBrains Mono, monospace', values: (_s: uPlot, vals: number[]) => vals.map((v) => formatSI(v)) },
        { ...axisStyle, label: isBode ? 'dB' : 'Value', labelFont: '11px JetBrains Mono, monospace', values: (_s: uPlot, vals: number[]) => vals.map((v) => formatSI(v)) },
      ],
      series,
    }

    if (uplotRef.current) uplotRef.current.destroy()
    uplotRef.current = new uPlot(opts, data, chartRef.current)

    return () => { uplotRef.current?.destroy(); uplotRef.current = null }
  }, [visibleVecs, plot, analysisType])

  useEffect(() => {
    if (!chartRef.current || !uplotRef.current) return
    const observer = new ResizeObserver(() => {
      if (chartRef.current && uplotRef.current) {
        uplotRef.current.setSize({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight || 200,
        })
      }
    })
    observer.observe(chartRef.current)
    return () => observer.disconnect()
  }, [visibleVecs])

  return (
    <div className={styles.plotContainer}>
      <div className={styles.legend}>
        <div className={styles.legendHeader}>
          <span className={styles.plotName}>{plot.name}</span>
          <span className={styles.legendActions}>
            <button className={styles.legendBtn} onClick={showAll}>All</button>
            <button className={styles.legendBtn} onClick={hideAll}>None</button>
          </span>
        </div>
        {yVecs.map((v, i) => (
          <label key={v.name} className={styles.legendItem}>
            <input type="checkbox" checked={visibleVecs.has(i)} onChange={() => toggleVec(i)} />
            <span className={styles.legendColor} style={{ background: COLORS[i % COLORS.length] }} />
            <span className={styles.legendLabel}>{formatVecName(v.name)}</span>
          </label>
        ))}
      </div>
      <div className={styles.chart} ref={chartRef} />
    </div>
  )
}
