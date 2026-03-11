import React from 'react'
import { Group, Line } from 'react-konva'

export const resistorPinPositions: Record<string, { x: number; y: number }> = {
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

export default function Resistor({ label, value, color, textColor, textSecondary }: Props) {
  const zigzag = [
    -40, 0, -30, 0, -25, -8, -15, 8, -5, -8, 5, 8, 15, -8, 25, 8, 30, 0, 40, 0,
  ]

  return (
    <Group>
      <Line points={zigzag} stroke={color} strokeWidth={2} lineCap="round" lineJoin="round" />
    </Group>
  )
}
