/**
 * SymbolRenderer — renders a component symbol defined in YAML (via ComponentDef.symbol.graphics)
 * using react-konva shapes.  Replaces the hard-coded symbol components for YAML-backed defs.
 */
import React from 'react'
import { Group, Line, Circle, Rect, Path, Text } from 'react-konva'
import type { GraphicsElement, SymbolGraphics, PinLocation } from '../../../../codegen/generated-rpc'

interface Props {
  symbol: SymbolGraphics
  pins: PinLocation[]
  color: string
  textColor: string
  textSecondary: string
  label?: string
  value?: string
  isHoveredPinId?: string | null
  pinHoverColor: string
  pinColor: string
}

/**
 * Convert a YAML arc element to an SVG path string.
 *
 * YAML convention: standard math angles (0=right, counter-clockwise positive).
 * SVG/Konva: angles measure clockwise from the right.  We negate to convert.
 *
 * The YAML arcs in inductor.yaml go start_angle=180→end_angle=0 which is a
 * half-circle going from left to right passing through the bottom, i.e. a
 * clockwise arc in standard SVG (sweep-flag=1 in SVG arc notation).
 */
function arcToPath(el: GraphicsElement): string | null {
  const { cx, cy, r, start_angle, end_angle } = el
  if (cx == null || cy == null || r == null || start_angle == null || end_angle == null) {
    return null
  }

  // Convert math angles (CCW positive) to SVG/Konva angles (CW positive)
  const startRad = (start_angle * Math.PI) / 180
  const endRad = (end_angle * Math.PI) / 180

  // Start and end points on the circle
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy - r * Math.sin(startRad)  // negate because y-axis is flipped in canvas
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy - r * Math.sin(endRad)

  // Determine large-arc-flag: 1 if sweep > 180°
  let sweep = start_angle - end_angle  // going from start to end clockwise
  if (sweep <= 0) sweep += 360
  const largeArc = sweep > 180 ? 1 : 0
  // sweep-flag=1 means clockwise in SVG
  const sweepFlag = 1

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`
}

function renderElement(el: GraphicsElement, color: string, key: number) {
  const sw = el.stroke_width ?? 1.5
  const fill = el.filled ? color : 'transparent'
  const stroke = color

  switch (el.kind) {
    case 'line':
      if (el.x1 == null || el.y1 == null || el.x2 == null || el.y2 == null) return null
      return (
        <Line
          key={key}
          points={[el.x1, el.y1, el.x2, el.y2]}
          stroke={stroke}
          strokeWidth={sw}
          listening={false}
        />
      )

    case 'circle':
      if (el.cx == null || el.cy == null || el.r == null) return null
      return (
        <Circle
          key={key}
          x={el.cx}
          y={el.cy}
          radius={el.r}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          listening={false}
        />
      )

    case 'arc': {
      const d = arcToPath(el)
      if (!d) return null
      return (
        <Path
          key={key}
          data={d}
          stroke={stroke}
          strokeWidth={sw}
          fill="transparent"
          listening={false}
        />
      )
    }

    case 'rect':
      if (el.x == null || el.y == null || el.width == null || el.height == null) return null
      return (
        <Rect
          key={key}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          listening={false}
        />
      )

    case 'polyline':
      if (!el.points || el.points.length < 4) return null
      return (
        <Line
          key={key}
          points={el.points}
          stroke={stroke}
          strokeWidth={sw}
          fill={el.filled ? color : undefined}
          closed={!!el.filled}
          listening={false}
        />
      )

    case 'text':
      if (!el.text || el.x == null || el.y == null) return null
      return (
        <Text
          key={key}
          x={el.x}
          y={el.y}
          text={el.text}
          fontSize={el.font_size ?? 12}
          fill={stroke}
          listening={false}
        />
      )

    default:
      return null
  }
}

export default function SymbolRenderer({
  symbol, pins, color, textColor, textSecondary,
  label, value, isHoveredPinId, pinHoverColor, pinColor
}: Props) {
  const bounds = symbol.bounds
  // Label below the bounding box, value below label
  const labelX = bounds.x
  const labelY = bounds.y + bounds.height + 4

  return (
    <Group>
      {/* Symbol graphics */}
      {symbol.graphics.map((el, i) => renderElement(el, color, i))}

      {/* Pin indicators */}
      {pins.map((pin) => {
        const isHovered = pin.id === isHoveredPinId || pin.name === isHoveredPinId
        return (
          <Circle
            key={pin.id}
            x={pin.x}
            y={pin.y}
            radius={isHovered ? 5 : 3}
            fill={isHovered ? pinHoverColor : pinColor}
            stroke={isHovered ? pinHoverColor : pinColor}
            strokeWidth={1}
            listening={false}
          />
        )
      })}

      {/* Label */}
      {label && (
        <Text
          text={label}
          x={labelX}
          y={labelY}
          fontSize={11}
          fill={textColor}
          fontFamily="monospace"
          listening={false}
        />
      )}
      {/* Value */}
      {value && (
        <Text
          text={value}
          x={labelX}
          y={labelY + 14}
          fontSize={10}
          fill={textSecondary}
          fontFamily="monospace"
          listening={false}
        />
      )}
    </Group>
  )
}
