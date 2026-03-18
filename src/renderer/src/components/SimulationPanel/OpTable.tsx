import React from 'react'
import type { SimResult } from '../../../../codegen/generated-rpc'
import { formatSI, formatVecName } from './formatters'
import styles from './SimulationPanel.module.css'

export function OpTable({ result }: { result: SimResult }) {
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
