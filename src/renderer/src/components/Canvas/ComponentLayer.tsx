import React from 'react'
import { Layer, Group, Circle, Rect, Text } from 'react-konva'
import type { ComponentInstance, Tool } from '../../types'
import type { ThemeColors } from '../../themes/colors'
import type { AbsolutePin } from '../../utils/pinUtils'
import { SYMBOL_REGISTRY } from '../../symbols'
import { useProjectStore } from '../../store/projectStore'
import SymbolRenderer from './SymbolRenderer'
import { GRID } from '../../constants'

interface Props {
  components: ComponentInstance[]
  selectedIds: Set<string>
  colors: ThemeColors
  onDragStart: (id: string, e: any) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onDragMove: (id: string, e: any) => void
  onClick: (id: string, e: any) => void
  onDblClick?: (id: string, e: any) => void
  onLabelDblClick?: (id: string, screenPos: { x: number; y: number }) => void
  tool: Tool
  hoveredPin: AbsolutePin | null
}

export default function ComponentLayer({
  components, selectedIds, colors, onDragStart, onDragEnd, onDragMove, onClick, onDblClick, onLabelDblClick, tool, hoveredPin
}: Props) {
  const { componentDefs } = useProjectStore()

  return (
    <Layer>
      {components.map((comp) => {
        const sym = SYMBOL_REGISTRY[comp.type_id]
        const yamlDef = componentDefs[comp.type_id]
        const isSelected = selectedIds.has(comp.id)
        const SymbolComponent = sym?.component
        const labelText = comp.label ?? sym?.label ?? yamlDef?.name
        const valueText = comp.properties.value != null ? String(comp.properties.value) : undefined

        return (
          <Group
            key={comp.id}
            id={comp.id}
            name="component"
            x={comp.position.x * GRID}
            y={comp.position.y * GRID}
            draggable={tool !== 'wire'}
            onDragStart={(e) => onDragStart(comp.id, e)}
            onDragMove={(e) => onDragMove(comp.id, e)}
            onDragEnd={(e) => {
              const x = Math.round(e.target.x() / GRID)
              const y = Math.round(e.target.y() / GRID)
              e.target.x(x * GRID)
              e.target.y(y * GRID)
              onDragEnd(comp.id, x, y)
            }}
            onClick={(e) => {
              if (tool !== 'wire') {
                e.cancelBubble = true
                onClick(comp.id, e)
              }
            }}
            onDblClick={(e) => {
              if (tool !== 'wire' && onDblClick) {
                e.cancelBubble = true
                onDblClick(comp.id, e)
              }
            }}
          >
            {/* Invisible hit area so clicks anywhere in the bounding box register */}
            <Rect
              x={-46}
              y={-46}
              width={92}
              height={92}
              fill="transparent"
            />

            {/* Rotated/flipped symbol graphics */}
            <Group rotation={comp.rotation} scaleX={comp.flip_x ? -1 : 1}>
              {isSelected && (
                <Rect
                  x={-46}
                  y={-46}
                  width={92}
                  height={92}
                  stroke={colors.selection}
                  strokeWidth={1.5}
                  dash={[4, 3]}
                  cornerRadius={4}
                  listening={false}
                />
              )}

              {yamlDef?.symbol ? (
                <SymbolRenderer
                  symbol={yamlDef.symbol}
                  pins={yamlDef.pins}
                  color={isSelected ? colors.componentSelected : colors.component}
                  textColor={colors.text}
                  textSecondary={colors.textSecondary}
                  label={labelText}
                  value={valueText}
                  isHoveredPinId={
                    hoveredPin?.componentId === comp.id ? hoveredPin.pinName : null
                  }
                  pinHoverColor={colors.pinHover}
                  pinColor={colors.pin}
                />
              ) : SymbolComponent ? (
                <>
                  <SymbolComponent
                    label={labelText}
                    value={valueText}
                    color={isSelected ? colors.componentSelected : colors.component}
                    textColor={colors.text}
                    textSecondary={colors.textSecondary}
                  />
                  {sym?.pins.map((pin) => {
                    const isHovered = hoveredPin?.componentId === comp.id && hoveredPin?.pinName === pin.name
                    return (
                      <Circle
                        key={pin.name}
                        x={pin.x}
                        y={pin.y}
                        radius={isHovered ? 5 : 3}
                        fill={isHovered ? colors.pinHover : colors.pin}
                        stroke={isHovered ? colors.pinHover : colors.pin}
                        strokeWidth={1}
                      />
                    )
                  })}
                </>
              ) : (
                <Group>
                  <Rect
                    x={-20} y={-12} width={40} height={24}
                    stroke={isSelected ? colors.componentSelected : colors.component}
                    strokeWidth={1.5}
                    cornerRadius={2}
                  />
                </Group>
              )}
            </Group>

            {/* Label/value text — NOT rotated with the component */}
            {sym && labelText && (
              <Text
                text={labelText}
                x={sym.labelOffset.x}
                y={sym.labelOffset.y}
                fontSize={11}
                fill={colors.text}
                fontFamily="monospace"
                listening={!!onLabelDblClick}
                onDblClick={(e) => {
                  if (!onLabelDblClick) return
                  e.cancelBubble = true
                  const stage = e.target.getStage()
                  const ptr = stage?.getPointerPosition()
                  if (ptr) onLabelDblClick(comp.id, ptr)
                }}
              />
            )}
            {sym && valueText && (
              <Text
                text={valueText}
                x={sym.valueOffset.x}
                y={sym.valueOffset.y}
                fontSize={10}
                fill={colors.textSecondary}
                fontFamily="monospace"
                listening={false}
              />
            )}
          </Group>
        )
      })}
    </Layer>
  )
}
