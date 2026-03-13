import React from 'react'
import { Group, Rect, Text } from 'react-konva'

interface Props {
  label?: string
  color: string
  textColor: string
  textSecondary: string
  /** The file property value (filename of the referenced circuit) */
  fileName?: string
}

export const subcircuitPinPositions = {
  a: { x: -40, y: 0 },
  b: { x: 40, y: 0 },
}

export default function Subcircuit({ label, color, textColor, fileName }: Props) {
  const displayName = fileName
    ? (fileName.split('/').pop() ?? fileName).replace(/\.eerie$/, '')
    : 'Subcircuit'

  return (
    <Group>
      <Rect
        x={-38}
        y={-24}
        width={76}
        height={48}
        stroke={color}
        strokeWidth={1.5}
        cornerRadius={3}
        dash={[6, 3]}
      />
      <Text
        x={-34}
        y={-8}
        text={displayName}
        fontSize={9}
        fill={textColor}
        fontFamily="monospace"
        width={68}
        align="center"
      />
    </Group>
  )
}
