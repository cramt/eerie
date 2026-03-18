import React, { useRef, useEffect, useState } from 'react'
import uPlot from 'uplot'
import type { SimPlot, SimVector } from '../../../../codegen/generated-rpc'
import { formatSI, formatVecName } from './formatters'
import styles from './SimulationPanel.module.css'

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

export function PlotResults({ plots, analysisType }: { plots: SimPlot[]; analysisType: string }) {
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
