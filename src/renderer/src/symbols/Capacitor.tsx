import React from 'react'
import { Group, Line } from 'react-konva'
export const capacitorPinPositions: Record<string, { x: number; y: number }> = {
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

export default function Capacitor({ label, value, color, textColor, textSecondary }: Props) {
  return (
    <Group>
      <Line points={[-40, 0, -6, 0]} stroke={color} strokeWidth={2} />
      <Line points={[6, 0, 40, 0]} stroke={color} strokeWidth={2} />
      <Line points={[-6, -14, -6, 14]} stroke={color} strokeWidth={2.5} />
      <Line points={[6, -14, 6, 14]} stroke={color} strokeWidth={2.5} />
    </Group>
  )
}
