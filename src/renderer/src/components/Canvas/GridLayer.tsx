import React, { useMemo } from 'react'
import { Layer, Circle } from 'react-konva'
import type { ThemeColors } from '../../themes/colors'
import { GRID } from '../../constants'

interface Props {
  width: number
  height: number
  offsetX: number
  offsetY: number
  zoom: number
  colors: ThemeColors
}

export default function GridLayer({ width, height, offsetX, offsetY, zoom, colors }: Props) {
  const dots = useMemo(() => {
    const result: { x: number; y: number; major: boolean }[] = []
    const startGX = Math.floor(-offsetX / GRID) - 1
    const startGY = Math.floor(-offsetY / GRID) - 1
    const endGX = Math.ceil((width / zoom - offsetX) / GRID) + 1
    const endGY = Math.ceil((height / zoom - offsetY) / GRID) + 1

    for (let gx = startGX; gx <= endGX; gx++) {
      for (let gy = startGY; gy <= endGY; gy++) {
        const major = gx % 5 === 0 && gy % 5 === 0
        result.push({ x: gx * GRID, y: gy * GRID, major })
      }
    }
    return result
  }, [width, height, offsetX, offsetY, zoom])

  return (
    <Layer listening={false}>
      {dots.map((d, i) => (
        <Circle
          key={i}
          x={d.x}
          y={d.y}
          radius={d.major ? 1.5 : 1}
          fill={d.major ? colors.gridMajor : colors.grid}
        />
      ))}
    </Layer>
  )
}
