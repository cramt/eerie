import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { findNearestPin, findNearestWirePoint, findNearestPointOnWire, getWireSnapPoints, type AbsolutePin } from '../../utils/pinUtils'
import type { Point } from '../../types'

type SnapTarget =
  | { kind: 'pin'; pin: AbsolutePin; pos: Point }
  | { kind: 'wire'; netId: string; pos: Point }

function findSnap(gp: Point, absolutePins: AbsolutePin[], wireSnapPoints: ReturnType<typeof getWireSnapPoints>, nets: import('../../types').Net[]): SnapTarget | null {
  const nearPin = findNearestPin(gp, absolutePins)
  const nearWireEndpoint = findNearestWirePoint(gp, wireSnapPoints)
  const nearWireSegment = findNearestPointOnWire(gp, nets)

  // Pick the closest wire snap (endpoint preferred over segment midpoint)
  const endpointDist = nearWireEndpoint
    ? Math.hypot(nearWireEndpoint.gridPos.x - gp.x, nearWireEndpoint.gridPos.y - gp.y)
    : Infinity
  const segmentDist = nearWireSegment
    ? Math.hypot(nearWireSegment.gridPos.x - gp.x, nearWireSegment.gridPos.y - gp.y)
    : Infinity
  const nearWire = endpointDist <= segmentDist ? nearWireEndpoint : nearWireSegment
  const wireDist = Math.min(endpointDist, segmentDist)

  const pinDist = nearPin
    ? Math.hypot(nearPin.gridPos.x - gp.x, nearPin.gridPos.y - gp.y)
    : Infinity

  if (!nearPin && !nearWire) return null

  // Prefer pin snap if equidistant
  if (nearPin && pinDist <= wireDist) {
    return { kind: 'pin', pin: nearPin, pos: nearPin.gridPos }
  }
  if (nearWire) {
    return { kind: 'wire', netId: nearWire.netId, pos: nearWire.gridPos }
  }
  return null
}

export function useWireDrawing(
  absolutePins: AbsolutePin[],
  screenToGrid: (sx: number, sy: number) => Point,
) {
  const [wireStart, setWireStart] = useState<Point | null>(null)
  const [mouseGridPos, setMouseGridPos] = useState<Point>({ x: 0, y: 0 })
  const [wireStartPin, setWireStartPin] = useState<AbsolutePin | null>(null)
  const [wireStartNetId, setWireStartNetId] = useState<string | null>(null)
  const [wireIsNew, setWireIsNew] = useState(true)
  const [hoveredPin, setHoveredPin] = useState<AbsolutePin | null>(null)
  const [snapIndicator, setSnapIndicator] = useState<Point | null>(null)
  const lastSnapRef = useRef<SnapTarget | null>(null)

  const tool = useUiStore((s) => s.tool)
  const nets = useCircuitStore((s) => s.circuit.nets)
  const addWireSegmentWithPins = useCircuitStore((s) => s.addWireSegmentWithPins)
  const storeSetMousePos = useUiStore((s) => s.setMouseGridPos)

  const wireSnapPoints = useMemo(
    () => getWireSnapPoints(nets),
    [nets]
  )

  useEffect(() => {
    setWireStart(null)
    setWireStartPin(null)
    setWireStartNetId(null)
    setHoveredPin(null)
    setSnapIndicator(null)
    setWireIsNew(true)
  }, [tool])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWireStart(null)
        setWireStartPin(null)
        setWireStartNetId(null)
        setWireIsNew(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleWireClick = useCallback((gp: Point) => {
    // Use the snap from the last mousemove (already shown to the user via indicator)
    // and fall back to re-detecting if none cached
    const snap = lastSnapRef.current
      ?? (() => {
        const currentNets = useCircuitStore.getState().circuit.nets
        const freshWireSnaps = getWireSnapPoints(currentNets)
        return findSnap(gp, absolutePins, freshWireSnaps, currentNets)
      })()
    const snapPos = snap ? snap.pos : gp
    const pinRef = snap?.kind === 'pin'
      ? { component_id: snap.pin.componentId, pin_name: snap.pin.pinName }
      : null
    const snapNetId = snap?.kind === 'wire' ? snap.netId : null

    if (!wireStart) {
      setWireStart(snapPos)
      setWireStartPin(snap?.kind === 'pin' ? snap.pin : null)
      setWireStartNetId(snapNetId)
      setWireIsNew(true)
    } else {
      if (snapPos.x !== wireStart.x || snapPos.y !== wireStart.y) {
        const startPinRef = wireIsNew && wireStartPin
          ? { component_id: wireStartPin.componentId, pin_name: wireStartPin.pinName }
          : null

        addWireSegmentWithPins(
          wireStart, snapPos,
          startPinRef, pinRef,
          wireIsNew,
          wireIsNew ? wireStartNetId : null,
          snapNetId,
        )
        setWireIsNew(false)
        setWireStartNetId(null)
      }

      if (pinRef || snapNetId) {
        setWireStart(null)
        setWireStartPin(null)
        setWireStartNetId(null)
        setWireIsNew(true)
      } else {
        setWireStart(snapPos)
      }
    }
  }, [wireStart, wireStartPin, wireStartNetId, wireIsNew, absolutePins, addWireSegmentWithPins])

  const handleWireMouseMove = useCallback((pointer: { x: number; y: number }) => {
    const gp = screenToGrid(pointer.x, pointer.y)
    const snap = findSnap(gp, absolutePins, wireSnapPoints, nets)
    lastSnapRef.current = snap
    setHoveredPin(snap?.kind === 'pin' ? snap.pin : null)
    setSnapIndicator(snap ? snap.pos : null)
    const snapPos = snap ? snap.pos : gp
    setMouseGridPos(snapPos)
    storeSetMousePos(snapPos)
  }, [screenToGrid, absolutePins, wireSnapPoints, nets, storeSetMousePos])

  const handleNonWireMouseMove = useCallback((pointer: { x: number; y: number }) => {
    const gp = screenToGrid(pointer.x, pointer.y)
    setHoveredPin(null)
    setMouseGridPos(gp)
    storeSetMousePos(gp)
  }, [screenToGrid, storeSetMousePos])

  const cancelWire = useCallback(() => {
    setWireStart(null)
    setWireStartPin(null)
    setWireStartNetId(null)
    setWireIsNew(true)
  }, [])

  return {
    wireStart, mouseGridPos, hoveredPin, wireIsNew, snapIndicator,
    handleWireClick, handleWireMouseMove, handleNonWireMouseMove, cancelWire,
  }
}
