import React, { useMemo } from 'react'
import { Layer, Shape } from 'react-konva'
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
  const gridBounds = useMemo(() => ({
    startGX: Math.floor(-offsetX / GRID) - 1,
    startGY: Math.floor(-offsetY / GRID) - 1,
    endGX: Math.ceil((width / zoom - offsetX) / GRID) + 1,
    endGY: Math.ceil((height / zoom - offsetY) / GRID) + 1,
  }), [width, height, offsetX, offsetY, zoom])

  return (
    <Layer listening={false}>
      <Shape
        sceneFunc={(ctx, shape) => {
          const { startGX, startGY, endGX, endGY } = gridBounds

          // Draw minor dots
          ctx.fillStyle = colors.grid
          ctx.beginPath()
          for (let gx = startGX; gx <= endGX; gx++) {
            for (let gy = startGY; gy <= endGY; gy++) {
              if (gx % 5 === 0 && gy % 5 === 0) continue
              const x = gx * GRID
              const y = gy * GRID
              ctx.moveTo(x + 1, y)
              ctx.arc(x, y, 1, 0, Math.PI * 2)
            }
          }
          ctx.fill()

          // Draw major dots
          ctx.fillStyle = colors.gridMajor
          ctx.beginPath()
          for (let gx = startGX; gx <= endGX; gx++) {
            for (let gy = startGY; gy <= endGY; gy++) {
              if (gx % 5 !== 0 || gy % 5 !== 0) continue
              const x = gx * GRID
              const y = gy * GRID
              ctx.moveTo(x + 1.5, y)
              ctx.arc(x, y, 1.5, 0, Math.PI * 2)
            }
          }
          ctx.fill()

          ctx.fillStrokeShape(shape)
        }}
      />
    </Layer>
  )
}
