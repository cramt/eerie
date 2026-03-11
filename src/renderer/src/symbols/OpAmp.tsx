import React from 'react'
import { Group, Line, Text } from 'react-konva'
export const opAmpPinPositions: Record<string, { x: number; y: number }> = {
  non_inverting: { x: -40, y: -14 },
  inverting: { x: -40, y: 14 },
  output: { x: 40, y: 0 },
  v_pos: { x: 0, y: -30 },
  v_neg: { x: 0, y: 30 },
}

interface Props {
  label?: string
  color: string
  textColor: string
}

export default function OpAmp({ label, color, textColor }: Props) {
  return (
    <Group>
      <Line points={[-24, -30, -24, 30, 30, 0]} stroke={color} strokeWidth={2} closed />
      <Line points={[-40, -14, -24, -14]} stroke={color} strokeWidth={2} />
      <Line points={[-40, 14, -24, 14]} stroke={color} strokeWidth={2} />
      <Line points={[30, 0, 40, 0]} stroke={color} strokeWidth={2} />
      <Text text="+" x={-20} y={-22} fontSize={12} fill={color} fontFamily="monospace" />
      <Text text={"\u2212"} x={-20} y={8} fontSize={14} fill={color} fontFamily="monospace" />
    </Group>
  )
}
