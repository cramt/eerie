import React from 'react'
import { Group, Line, Arc } from 'react-konva'
export const inductorPinPositions: Record<string, { x: number; y: number }> = {
  a: { x: -40, y: 0 },
  b: { x: 40, y: 0 },
}

interface Props {
  label?: string
  value?: string
  color: string
  textColor: string
  textSecondary: string
}

export default function Inductor({ label, value, color, textColor, textSecondary }: Props) {
  return (
    <Group>
      <Line points={[-40, 0, -24, 0]} stroke={color} strokeWidth={2} />
      <Arc x={-16} y={0} innerRadius={0} outerRadius={8} angle={180} rotation={-180} stroke={color} strokeWidth={2} fill="" />
      <Arc x={-2} y={0} innerRadius={0} outerRadius={8} angle={180} rotation={-180} stroke={color} strokeWidth={2} fill="" />
      <Arc x={12} y={0} innerRadius={0} outerRadius={8} angle={180} rotation={-180} stroke={color} strokeWidth={2} fill="" />
      <Line points={[20, 0, 40, 0]} stroke={color} strokeWidth={2} />
    </Group>
  )
}
