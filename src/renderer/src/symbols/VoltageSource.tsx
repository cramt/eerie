import React from 'react'
import { Group, Circle, Line, Text } from 'react-konva'
export const voltageSourcePinPositions: Record<string, { x: number; y: number }> = {
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

export default function VoltageSource({ label, value, color, textColor, textSecondary }: Props) {
  return (
    <Group>
      <Line points={[0, -40, 0, -20]} stroke={color} strokeWidth={2} />
      <Line points={[0, 20, 0, 40]} stroke={color} strokeWidth={2} />
      <Circle x={0} y={0} radius={20} stroke={color} strokeWidth={2} />
      <Line points={[-5, -10, 5, -10]} stroke={color} strokeWidth={1.5} />
      <Line points={[0, -15, 0, -5]} stroke={color} strokeWidth={1.5} />
      <Line points={[-5, 10, 5, 10]} stroke={color} strokeWidth={1.5} />
    </Group>
  )
}
