import React from 'react'
import { Group, Circle, Arrow, Line, Text } from 'react-konva'
export const currentSourcePinPositions: Record<string, { x: number; y: number }> = {
  positive: { x: 0, y: -40 },
  negative: { x: 0, y: 40 },
}

interface Props {
  label?: string
  value?: string
  color: string
  textColor: string
  textSecondary: string
}

export default function CurrentSource({ label, value, color, textColor, textSecondary }: Props) {
  return (
    <Group>
      <Line points={[0, -40, 0, -20]} stroke={color} strokeWidth={2} />
      <Line points={[0, 20, 0, 40]} stroke={color} strokeWidth={2} />
      <Circle x={0} y={0} radius={20} stroke={color} strokeWidth={2} />
      <Arrow points={[0, 12, 0, -12]} stroke={color} strokeWidth={2} fill={color} pointerLength={6} pointerWidth={5} />
    </Group>
  )
}
