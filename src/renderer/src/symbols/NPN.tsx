import React from 'react'
import { Group, Line, Circle, Arrow } from 'react-konva'
export const npnPinPositions: Record<string, { x: number; y: number }> = {
  base: { x: -30, y: 0 },
  collector: { x: 20, y: -30 },
  emitter: { x: 20, y: 30 },
}

interface Props {
  label?: string
  color: string
  textColor: string
}

export default function NPN({ label, color, textColor }: Props) {
  return (
    <Group>
      <Line points={[-30, 0, -6, 0]} stroke={color} strokeWidth={2} />
      <Line points={[-6, -16, -6, 16]} stroke={color} strokeWidth={2.5} />
      <Line points={[-6, -8, 20, -30]} stroke={color} strokeWidth={2} />
      <Arrow points={[-6, 8, 20, 30]} stroke={color} strokeWidth={2} fill={color} pointerLength={6} pointerWidth={5} />
      <Circle x={4} y={0} radius={24} stroke={color} strokeWidth={1.5} />
    </Group>
  )
}
