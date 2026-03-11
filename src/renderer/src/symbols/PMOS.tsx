import React from 'react'
import { Group, Line, Arrow, Circle as KCircle } from 'react-konva'
export const pmosPinPositions: Record<string, { x: number; y: number }> = {
  gate: { x: -30, y: 0 },
  drain: { x: 20, y: 30 },
  source: { x: 20, y: -30 },
  body: { x: 30, y: 0 },
}

interface Props {
  label?: string
  color: string
  textColor: string
}

export default function PMOS({ label, color, textColor }: Props) {
  return (
    <Group>
      <Line points={[-30, 0, -14, 0]} stroke={color} strokeWidth={2} />
      <KCircle x={-12} y={0} radius={3} stroke={color} strokeWidth={1.5} />
      <Line points={[-10, -14, -10, 14]} stroke={color} strokeWidth={2} />
      <Line points={[-6, -14, -6, -4]} stroke={color} strokeWidth={2} />
      <Line points={[-6, -3, -6, 3]} stroke={color} strokeWidth={2} />
      <Line points={[-6, 4, -6, 14]} stroke={color} strokeWidth={2} />
      <Line points={[20, -30, 20, -10]} stroke={color} strokeWidth={2} />
      <Arrow points={[20, -10, -6, -10]} stroke={color} strokeWidth={2} fill={color} pointerLength={5} pointerWidth={4} />
      <Line points={[-6, 10, 20, 10]} stroke={color} strokeWidth={2} />
      <Line points={[20, 10, 20, 30]} stroke={color} strokeWidth={2} />
    </Group>
  )
}
