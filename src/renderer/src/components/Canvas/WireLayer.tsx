import React from 'react'
import { Layer, Group, Line, Circle } from 'react-konva'
import type { Net, Point } from '../../types'
import type { ThemeColors } from '../../themes/colors'
import { GRID } from '../../constants'

interface Props {
  nets: Net[]
  selectedNetIds: Set<string>
  wireStart: Point | null
  mousePos: Point
  isWiring: boolean
  colors: ThemeColors
  snapTarget: Point | null
  onNetClick: (netId: string, e: any) => void
}

export default function WireLayer({ nets, selectedNetIds, wireStart, mousePos, isWiring, colors, snapTarget, onNetClick }: Props) {
  return (
    <Layer>
      {/* Existing wires */}
      {nets.map((net) => {
        const isSelected = selectedNetIds.has(net.id)
        const strokeColor = isSelected ? colors.componentSelected : colors.wire
        return (
          <Group key={net.id}>
            {net.segments.map((seg, i) => (
              <React.Fragment key={i}>
                {/* Invisible thick hit area — only listen in select mode */}
                {!isWiring && (
                  <Line
                    points={[
                      seg.start.x * GRID, seg.start.y * GRID,
                      seg.end.x * GRID, seg.end.y * GRID,
                    ]}
                    stroke="transparent"
                    strokeWidth={12}
                    lineCap="round"
                    hitStrokeWidth={12}
                    onClick={(e) => { e.cancelBubble = true; onNetClick(net.id, e) }}
                  />
                )}
                {/* Visible wire */}
                <Line
                  points={[
                    seg.start.x * GRID, seg.start.y * GRID,
                    seg.end.x * GRID, seg.end.y * GRID,
                  ]}
                  stroke={strokeColor}
                  strokeWidth={2}
                  lineCap="round"
                  listening={false}
                />
              </React.Fragment>
            ))}

            {/* Junction dots — only at points shared by 3+ segment endpoints (T-junctions) */}
            {(() => {
              const counts = new Map<string, { x: number; y: number; n: number }>()
              for (const seg of net.segments) {
                for (const pt of [seg.start, seg.end]) {
                  const key = `${pt.x},${pt.y}`
                  const entry = counts.get(key)
                  if (entry) entry.n++
                  else counts.set(key, { x: pt.x, y: pt.y, n: 1 })
                }
              }
              return [...counts.values()]
                .filter(p => p.n >= 3)
                .map((p, i) => (
                  <Circle key={`junc-${i}`} x={p.x * GRID} y={p.y * GRID} radius={3} fill={strokeColor} listening={false} />
                ))
            })()}

            {/* Selection highlight — dashed outline */}
            {isSelected && net.segments.map((seg, i) => (
              <Line
                key={`sel-${i}`}
                points={[
                  seg.start.x * GRID, seg.start.y * GRID,
                  seg.end.x * GRID, seg.end.y * GRID,
                ]}
                stroke={colors.selection}
                strokeWidth={5}
                lineCap="round"
                opacity={0.3}
                listening={false}
              />
            ))}
          </Group>
        )
      })}

      {/* Wire in progress — L-shaped orthogonal routing */}
      {isWiring && wireStart && (
        <>
          <Line
            points={(() => {
              const dx = Math.abs(mousePos.x - wireStart.x)
              const dy = Math.abs(mousePos.y - wireStart.y)
              // Horizontal-first if dx >= dy, vertical-first otherwise
              const mid = dx >= dy
                ? { x: mousePos.x, y: wireStart.y }
                : { x: wireStart.x, y: mousePos.y }
              return [
                wireStart.x * GRID, wireStart.y * GRID,
                mid.x * GRID, mid.y * GRID,
                mousePos.x * GRID, mousePos.y * GRID,
              ]
            })()}
            stroke={colors.wirePreview}
            strokeWidth={2}
            lineCap="round"
            dash={[6, 4]}
            listening={false}
          />
          <Circle x={wireStart.x * GRID} y={wireStart.y * GRID} radius={4} fill={colors.wire} listening={false} />
        </>
      )}

      {/* Snap indicator */}
      {isWiring && snapTarget && (
        <Circle
          x={snapTarget.x * GRID}
          y={snapTarget.y * GRID}
          radius={8}
          stroke={colors.pinHover}
          strokeWidth={1.5}
          dash={[4, 3]}
          listening={false}
        />
      )}
    </Layer>
  )
}
