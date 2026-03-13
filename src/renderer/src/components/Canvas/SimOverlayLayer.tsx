/**
 * SimOverlayLayer — draws simulation results (node voltages, branch currents)
 * as small labels overlaid on the canvas wires and components.
 */
import React from 'react'
import { Layer, Text } from 'react-konva'
import type { Net } from '../../types'
import type { SimResult } from '../../../../codegen/generated-rpc'
import { GRID } from '../../constants'

interface Props {
  nets: Net[]
  result: SimResult | null
  netNodeMap: Map<string, string>
  /** Offset from the canvas pan/zoom transform (applied by parent Stage) */
  color: string
}

/** Format a voltage value for display, e.g. 3.3 → "3.30 V", 0.001 → "1.00 mV" */
function formatVoltage(v: number): string {
  const abs = Math.abs(v)
  if (abs === 0) return '0 V'
  if (abs >= 1) return `${v.toFixed(3)} V`
  if (abs >= 0.001) return `${(v * 1000).toFixed(2)} mV`
  return `${(v * 1e6).toFixed(1)} µV`
}

/** Find a voltage vector by node name (case-insensitive), trying v(name) and plain name. */
function findNodeVoltage(result: SimResult, nodeName: string): number | null {
  if (nodeName === '0') return 0
  const lower = nodeName.toLowerCase()
  for (const plot of result.plots) {
    for (const vec of plot.vecs) {
      const vname = vec.name.toLowerCase()
      if (vname === `v(${lower})` || vname === lower) {
        if (vec.real.length > 0) return vec.real[0]
      }
    }
  }
  return null
}

/** Compute the midpoint of a net's first wire segment for label placement. */
function netLabelPos(net: Net): { x: number; y: number } | null {
  const seg = net.segments[0]
  if (!seg) return null
  return {
    x: ((seg.start.x + seg.end.x) / 2) * GRID,
    y: ((seg.start.y + seg.end.y) / 2) * GRID - 14,  // offset above the wire
  }
}

export default function SimOverlayLayer({ nets, result, netNodeMap, color }: Props) {
  if (!result) return null

  return (
    <Layer listening={false}>
      {nets.map((net) => {
        const nodeName = netNodeMap.get(net.id)
        if (!nodeName || nodeName === '0') return null

        const voltage = findNodeVoltage(result, nodeName)
        if (voltage == null) return null

        const pos = netLabelPos(net)
        if (!pos) return null

        return (
          <Text
            key={net.id}
            x={pos.x}
            y={pos.y}
            text={formatVoltage(voltage)}
            fontSize={9}
            fill={color}
            fontFamily="monospace"
            padding={1}
          />
        )
      })}
    </Layer>
  )
}
