import { useState, useRef, useCallback } from 'react'
import { useUiStore } from '../../store/uiStore'
import type { Point } from '../../types'
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

  return {
    viewOffset, zoom, screenToGrid,
    handleWheel, handlePanStart, handlePanMove, handlePanEnd,
  }
}
