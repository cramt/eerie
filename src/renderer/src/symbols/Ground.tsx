import React from 'react'
import { Group, Line, Text } from 'react-konva'
export const groundPinPositions: Record<string, { x: number; y: number }> = {
  gnd: { x: 0, y: -20 },
}

interface Props {
  label?: string
  color: string
  textColor: string
}

export default function Ground({ label, color, textColor }: Props) {
  return (
    <Group>
      <Line points={[0, -20, 0, 0]} stroke={color} strokeWidth={2} />
      <Line points={[-16, 0, 16, 0]} stroke={color} strokeWidth={2} />
      <Line points={[-10, 6, 10, 6]} stroke={color} strokeWidth={2} />
      <Line points={[-4, 12, 4, 12]} stroke={color} strokeWidth={2} />
    </Group>
  )
}
