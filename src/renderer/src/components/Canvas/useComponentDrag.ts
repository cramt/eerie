import { useCallback, useRef } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { useHistoryStore } from '../../store/historyStore'
import { GRID } from '../../constants'

export function useComponentDrag() {
  const selectComponent = useUiStore((s) => s.selectComponent)
  const toggleSelectComponent = useUiStore((s) => s.toggleSelectComponent)
  const moveComponent = useCircuitStore((s) => s.moveComponent)
  const moveComponents = useCircuitStore((s) => s.moveComponents)
  const pushUndo = useHistoryStore((s) => s.pushUndo)
  // Track drag start positions for multi-drag
  const dragStartRef = useRef<{ id: string; startX: number; startY: number } | null>(null)

  const handleComponentClick = useCallback((id: string, e: any) => {
    const shiftKey = e.evt?.shiftKey || e.evt?.ctrlKey || e.evt?.metaKey
    if (shiftKey) {
      toggleSelectComponent(id)
    } else {
      selectComponent(id)
    }
  }, [selectComponent, toggleSelectComponent])

  const handleDragStart = useCallback((id: string, e: any) => {
    pushUndo()
    const selectedIds = useUiStore.getState().selectedComponentIds
    // If dragging an unselected component, select just it
    if (!selectedIds.has(id)) {
      selectComponent(id)
    }
    dragStartRef.current = {
      id,
      startX: e.target.x(),
      startY: e.target.y(),
    }
  }, [pushUndo, selectComponent])

  const handleDragMove = useCallback((id: string, e: any) => {
    const selectedIds = useUiStore.getState().selectedComponentIds
    if (selectedIds.size <= 1 || !dragStartRef.current) return

    // Calculate delta from this component's drag
    const node = e.target
    const dx = node.x() - dragStartRef.current.startX
    const dy = node.y() - dragStartRef.current.startY

    // Move other selected components by the same delta
    const stage = node.getStage()
    if (!stage) return
    const layer = node.getLayer()
    if (!layer) return

    for (const compId of selectedIds) {
      if (compId === id) continue
      const group = layer.findOne(`#${compId}`)
      if (group) {
        const comp = useCircuitStore.getState().circuit.components.find(c => c.id === compId)
        if (comp) {
          group.x(comp.position.x * GRID + dx)
          group.y(comp.position.y * GRID + dy)
        }
      }
    }
  }, [])

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    const selectedIds = useUiStore.getState().selectedComponentIds
    if (selectedIds.size <= 1 || !dragStartRef.current) {
      moveComponent(id, x, y)
      dragStartRef.current = null
      return
    }

    // Calculate grid-snapped delta
    const comp = useCircuitStore.getState().circuit.components.find(c => c.id === id)
    if (!comp) { dragStartRef.current = null; return }
    const dx = x - comp.position.x
    const dy = y - comp.position.y

    // Move all selected components by the same delta
    moveComponents([...selectedIds], dx, dy)

    // Reset Konva positions to match new state
    // (the re-render will handle this, but clear ref)
    dragStartRef.current = null
  }, [moveComponent, moveComponents])

  return { handleComponentClick, handleDragStart, handleDragMove, handleDragEnd }
}
