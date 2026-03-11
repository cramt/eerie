import React from 'react'
import { Layer, Group, Rect } from 'react-konva'
import type { ComponentInstance, Point } from '../../types'
import type { ThemeColors } from '../../themes/colors'
import { SYMBOL_REGISTRY } from '../../symbols'
import { GRID } from '../../constants'

interface Props {
  placingTypeId: string | null
  mousePos: Point
  isPlacing: boolean
  colors: ThemeColors
  selectionRect: { start: Point; end: Point } | null
}

export default function OverlayLayer({ placingTypeId, mousePos, isPlacing, colors, selectionRect }: Props) {
  return (
    <Layer listening={false}>
      {/* Placement ghost */}
      {isPlacing && placingTypeId && (() => {
        const sym = SYMBOL_REGISTRY[placingTypeId]
        const SymbolComponent = sym?.component
        return (
          <Group x={mousePos.x * GRID} y={mousePos.y * GRID} opacity={0.5}>
            {SymbolComponent ? (
              <SymbolComponent
                label={sym.label}
                color={colors.component}
                textColor={colors.text}
                textSecondary={colors.textSecondary}
              />
            ) : (
              <Rect x={-20} y={-12} width={40} height={24} stroke={colors.component} strokeWidth={1.5} dash={[4, 4]} />
            )}
          </Group>
        )
      })()}

      {/* Selection rectangle */}
      {selectionRect && (
        <Rect
          x={Math.min(selectionRect.start.x, selectionRect.end.x) * GRID}
          y={Math.min(selectionRect.start.y, selectionRect.end.y) * GRID}
          width={Math.abs(selectionRect.end.x - selectionRect.start.x) * GRID}
          height={Math.abs(selectionRect.end.y - selectionRect.start.y) * GRID}
          stroke={colors.selection}
          strokeWidth={1}
          fill={colors.selectionFill}
          dash={[4, 4]}
        />
      )}
    </Layer>
  )
}
