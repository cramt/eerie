import React from 'react'
import { Group, Line } from 'react-konva'
export const diodePinPositions: Record<string, { x: number; y: number }> = {
  anode: { x: -30, y: 0 },
  cathode: { x: 30, y: 0 },
}

interface Props {
  label?: string
  value?: string
  color: string
  textColor: string
  textSecondary: string
}

export default function Diode({ label, value, color, textColor, textSecondary }: Props) {
  return (
    <Group>
      <Line points={[-30, 0, -10, 0]} stroke={color} strokeWidth={2} />
      <Line points={[10, 0, 30, 0]} stroke={color} strokeWidth={2} />
      <Line points={[-10, -12, 10, 0, -10, 12]} stroke={color} strokeWidth={2} closed />
      <Line points={[10, -12, 10, 12]} stroke={color} strokeWidth={2.5} />
    </Group>
  )
}
