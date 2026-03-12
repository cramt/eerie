import { useState, useRef, useCallback } from 'react'
import { useUiStore } from '../../store/uiStore'
import type { Point, Circuit } from '../../types'
import { GRID } from '../../constants'
const MIN_ZOOM = 0.15
const MAX_ZOOM = 8

export function useCanvasView() {
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoomState] = useState(1)
  const setZoom = useUiStore((s) => s.setZoom)

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  const screenToGrid = useCallback((sx: number, sy: number): Point => {
    const gx = Math.round((sx / zoom - viewOffset.x) / GRID)
    const gy = Math.round((sy / zoom - viewOffset.y) / GRID)
    return { x: gx, y: gy }
  }, [zoom, viewOffset])

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const factor = e.evt.deltaY < 0 ? 1.08 : 1 / 1.08
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))

    const newOffset = {
      x: pointer.x / newZoom - pointer.x / zoom + viewOffset.x,
      y: pointer.y / newZoom - pointer.y / zoom + viewOffset.y,
    }

    setZoomState(newZoom)
    setViewOffset(newOffset)
    setZoom(newZoom)
  }, [zoom, viewOffset, setZoom])

  const handlePanStart = useCallback((pointer: { x: number; y: number }) => {
    isPanningRef.current = true
    panStartRef.current = { x: pointer.x, y: pointer.y, ox: viewOffset.x, oy: viewOffset.y }
  }, [viewOffset])

  const handlePanMove = useCallback((pointer: { x: number; y: number }): boolean => {
    if (!isPanningRef.current) return false
    const dx = (pointer.x - panStartRef.current.x) / zoom
    const dy = (pointer.y - panStartRef.current.y) / zoom
    setViewOffset({
      x: panStartRef.current.ox + dx,
      y: panStartRef.current.oy + dy,
    })
    return true
  }, [zoom])

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false
  }, [])

  /** Set view so that the entire circuit fits within the given canvas size. */
  const fitToCircuit = useCallback((circuit: Circuit, canvasWidth: number, canvasHeight: number) => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return

    // Collect all points that contribute to the bounding box (in grid units)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasContent = false

    for (const comp of circuit.components) {
      hasContent = true
      minX = Math.min(minX, comp.position.x)
      minY = Math.min(minY, comp.position.y)
      maxX = Math.max(maxX, comp.position.x)
      maxY = Math.max(maxY, comp.position.y)
    }

    for (const net of circuit.nets) {
      for (const seg of net.segments) {
        hasContent = true
        minX = Math.min(minX, seg.start.x, seg.end.x)
        minY = Math.min(minY, seg.start.y, seg.end.y)
        maxX = Math.max(maxX, seg.start.x, seg.end.x)
        maxY = Math.max(maxY, seg.start.y, seg.end.y)
      }
    }

    if (!hasContent) {
      // Empty circuit — reset to default centered view
      setZoomState(1)
      setViewOffset({ x: canvasWidth / 2, y: canvasHeight / 2 })
      setZoom(1)
      return
    }

    // Add padding in grid units (so components at the edge aren't clipped)
    const PAD = 4
    minX -= PAD
    minY -= PAD
    maxX += PAD
    maxY += PAD

    // Convert bounding box to pixels
    const boxWidthPx = (maxX - minX) * GRID
    const boxHeightPx = (maxY - minY) * GRID

    // Calculate zoom to fit
    const newZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(canvasWidth / boxWidthPx, canvasHeight / boxHeightPx)),
    )

    // Calculate offset to center the bounding box
    const centerXPx = ((minX + maxX) / 2) * GRID
    const centerYPx = ((minY + maxY) / 2) * GRID
    const newOffset = {
      x: canvasWidth / (2 * newZoom) - centerXPx,
      y: canvasHeight / (2 * newZoom) - centerYPx,
    }

    setZoomState(newZoom)
    setViewOffset(newOffset)
    setZoom(newZoom)
  }, [setZoom])

  return {
    viewOffset, zoom, screenToGrid, fitToCircuit,
    handleWheel, handlePanStart, handlePanMove, handlePanEnd,
  }
}
