import React, { useState } from 'react'
import type { Analysis, Expr } from '../../../../codegen/generated-rpc'
import styles from './SimulationPanel.module.css'

const ANALYSIS_TYPES = ['Op', 'Tran', 'Ac', 'Dc'] as const
type AnalysisTypeName = (typeof ANALYSIS_TYPES)[number]

/** Get the numeric value from an Expr, or 0 if not a Num */
function exprNum(e: Expr | null | undefined): number {
  if (e && e.tag === 'Num') return e.value
  return 0
}

function numExpr(v: number): Expr {
  return { tag: 'Num', value: v }
}

export function ConfigBar({
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
