import type { ComponentInstance, Point } from '../types'
import { SYMBOL_REGISTRY } from '../symbols'
import { GRID } from '../constants'

export interface AbsolutePin {
  componentId: string
  pinName: string
  gridPos: Point
}

/** Compute absolute grid positions for all component pins, handling rotation and flip_x. */
export function getAbsolutePins(components: ComponentInstance[]): AbsolutePin[] {
  const result: AbsolutePin[] = []
  for (const comp of components) {
    const sym = SYMBOL_REGISTRY[comp.type_id]
    if (!sym) continue
    for (const pin of sym.pins) {
      // Pin local coordinates are in pixels; apply flip then rotation
      const px = comp.flip_x ? -pin.x : pin.x
      const py = pin.y

      const rad = (comp.rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const rx = px * cos - py * sin
      const ry = px * sin + py * cos

      result.push({
        componentId: comp.id,
        pinName: pin.name,
        gridPos: {
          x: comp.position.x + rx / GRID,
          y: comp.position.y + ry / GRID,
        },
      })
    }
  }
  return result
}

/** Find nearest pin within threshold grid units. Returns null if none close enough. */
export function findNearestPin(
  gridPos: Point,
  pins: AbsolutePin[],
  threshold: number = 1.5,
): AbsolutePin | null {
  let best: AbsolutePin | null = null
  let bestDist = threshold
  for (const pin of pins) {
    const dx = pin.gridPos.x - gridPos.x
    const dy = pin.gridPos.y - gridPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < bestDist) {
      bestDist = dist
      best = pin
    }
  }
  return best
}

export interface WireSnapPoint {
  netId: string
  gridPos: Point
}

/** Collect all unique wire endpoint positions from nets. */
export function getWireSnapPoints(nets: import('../types').Net[]): WireSnapPoint[] {
  const result: WireSnapPoint[] = []
  const seen = new Set<string>()
  for (const net of nets) {
    for (const seg of net.segments) {
      for (const pt of [seg.start, seg.end]) {
        const key = `${net.id}:${pt.x},${pt.y}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push({ netId: net.id, gridPos: pt })
        }
      }
    }
  }
  return result
}

/** Find nearest wire snap point within threshold (endpoints only). */
export function findNearestWirePoint(
  gridPos: Point,
  points: WireSnapPoint[],
  threshold: number = 1.5,
): WireSnapPoint | null {
  let best: WireSnapPoint | null = null
  let bestDist = threshold
  for (const wp of points) {
    const dx = wp.gridPos.x - gridPos.x
    const dy = wp.gridPos.y - gridPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < bestDist) {
      bestDist = dist
      best = wp
    }
  }
  return best
}

/** Find the nearest point on any wire segment (not just endpoints).
 *  Returns the closest point snapped to the grid, if within threshold. */
export function findNearestPointOnWire(
  gridPos: Point,
  nets: import('../types').Net[],
  threshold: number = 1.0,
): WireSnapPoint | null {
  let best: WireSnapPoint | null = null
  let bestDist = threshold
  for (const net of nets) {
    for (const seg of net.segments) {
      // Project gridPos onto the segment line
      const ax = seg.start.x, ay = seg.start.y
      const bx = seg.end.x, by = seg.end.y
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) continue
      let t = ((gridPos.x - ax) * dx + (gridPos.y - ay) * dy) / lenSq
      t = Math.max(0, Math.min(1, t))
      // Snap the projected point to grid
      const px = Math.round(ax + t * dx)
      const py = Math.round(ay + t * dy)
      const dist = Math.hypot(px - gridPos.x, py - gridPos.y)
      if (dist < bestDist) {
        bestDist = dist
        best = { netId: net.id, gridPos: { x: px, y: py } }
      }
    }
  }
  return best
}
