import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { Stage } from 'react-konva'
import { useCircuitStore } from '../../store/circuitStore'
import { useUiStore } from '../../store/uiStore'
import { getThemeColors } from '../../themes/colors'
import { getAbsolutePins } from '../../utils/pinUtils'
import { useCanvasView } from './useCanvasView'
import { useWireDrawing } from './useWireDrawing'
import { useComponentDrag } from './useComponentDrag'
import GridLayer from './GridLayer'
import WireLayer from './WireLayer'
import ComponentLayer from './ComponentLayer'
import OverlayLayer from './OverlayLayer'
import ContextMenu, { type ContextMenuEntry } from './ContextMenu'
import { SYMBOL_REGISTRY } from '../../symbols'
import type { Point } from '../../types'
import styles from './Canvas.module.css'

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuEntry[]
}

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null)
  const marqueeRef = useRef<{ start: Point; active: boolean }>({ start: { x: 0, y: 0 }, active: false })

  const { circuit, addComponent, removeComponent, removeComponents, updateComponent, removeNet, removeNets } = useCircuitStore()
  const { tool, placingTypeId, selectedComponentIds, selectedNetIds, theme } = useUiStore()
  const selectComponent = useUiStore((s) => s.selectComponent)
  const selectComponents = useUiStore((s) => s.selectComponents)
  const selectNet = useUiStore((s) => s.selectNet)
  const toggleSelectNet = useUiStore((s) => s.toggleSelectNet)
  const selectNets = useUiStore((s) => s.selectNets)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const setTool = useUiStore((s) => s.setTool)
  const setPlacingTypeId = useUiStore((s) => s.setPlacingTypeId)
  const colors = getThemeColors(theme)

  const absolutePins = useMemo(
    () => getAbsolutePins(circuit.components),
    [circuit.components]
  )

  const { viewOffset, zoom, screenToGrid, handleWheel, handlePanStart, handlePanMove, handlePanEnd } = useCanvasView()
  const { wireStart, mouseGridPos, hoveredPin, snapIndicator, handleWireClick, handleWireMouseMove, handleNonWireMouseMove, cancelWire } = useWireDrawing(absolutePins, screenToGrid)
  const { handleComponentClick, handleDragStart, handleDragMove, handleDragEnd } = useComponentDrag()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const handleNetClick = useCallback((netId: string, e: any) => {
    if (tool !== 'select') return
    const shiftKey = e.evt?.shiftKey || e.evt?.ctrlKey || e.evt?.metaKey
    if (shiftKey) {
      toggleSelectNet(netId)
    } else {
      selectNet(netId)
    }
  }, [tool, selectNet, toggleSelectNet])

  const handleStageClick = useCallback((e: any) => {
    if (marqueeRef.current.active) return

    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    const gp = screenToGrid(pointer.x, pointer.y)
    const isBackground = e.target === stage

    if (tool === 'place' && placingTypeId && isBackground) { addComponent(placingTypeId, gp.x, gp.y); return }
    if (tool === 'wire') { handleWireClick(gp); return }
    if (tool === 'select' && isBackground) { clearSelection() }
  }, [tool, placingTypeId, screenToGrid, addComponent, handleWireClick, clearSelection])

  const handleMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    if (handlePanMove(pointer)) return

    if (marqueeRef.current.active) {
      const gp = screenToGrid(pointer.x, pointer.y)
      setMarquee({ start: marqueeRef.current.start, end: gp })
      return
    }

    if (tool === 'wire') { handleWireMouseMove(pointer) } else { handleNonWireMouseMove(pointer) }
  }, [handlePanMove, tool, handleWireMouseMove, handleNonWireMouseMove, screenToGrid])

  const handleMouseDown = useCallback((e: any) => {
    if (e.evt.button === 1) {
      e.evt.preventDefault()
      const pointer = e.target.getStage()?.getPointerPosition()
      if (pointer) handlePanStart(pointer)
      return
    }

    if (e.evt.button === 0 && tool === 'select') {
      const stage = e.target.getStage()
      const isBackground = e.target === stage
      if (isBackground) {
        const pointer = stage?.getPointerPosition()
        if (pointer) {
          const gp = screenToGrid(pointer.x, pointer.y)
          marqueeRef.current = { start: gp, active: true }
          setMarquee({ start: gp, end: gp })
        }
      }
    }
  }, [handlePanStart, tool, screenToGrid])

  const handleMouseUp = useCallback((e: any) => {
    handlePanEnd()

    if (marqueeRef.current.active) {
      const stage = e.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (pointer) {
        const endGp = screenToGrid(pointer.x, pointer.y)
        const start = marqueeRef.current.start
        const minX = Math.min(start.x, endGp.x)
        const maxX = Math.max(start.x, endGp.x)
        const minY = Math.min(start.y, endGp.y)
        const maxY = Math.max(start.y, endGp.y)

        if (maxX - minX > 0.5 || maxY - minY > 0.5) {
          const compIds = circuit.components
            .filter(c => c.position.x >= minX && c.position.x <= maxX &&
                         c.position.y >= minY && c.position.y <= maxY)
            .map(c => c.id)

          // Also select nets whose segments are fully inside the marquee
          const netIds = circuit.nets
            .filter(n => n.segments.every(seg =>
              Math.min(seg.start.x, seg.end.x) >= minX && Math.max(seg.start.x, seg.end.x) <= maxX &&
              Math.min(seg.start.y, seg.end.y) >= minY && Math.max(seg.start.y, seg.end.y) <= maxY
            ))
            .map(n => n.id)

          const shiftKey = e.evt?.shiftKey || e.evt?.ctrlKey || e.evt?.metaKey
          if (shiftKey) {
            const existingComps = useUiStore.getState().selectedComponentIds
            const existingNets = useUiStore.getState().selectedNetIds
            selectComponents([...existingComps, ...compIds])
            selectNets([...existingNets, ...netIds])
          } else {
            selectComponents(compIds)
            selectNets(netIds)
          }
        }
      }

      setTimeout(() => { marqueeRef.current.active = false }, 0)
      setMarquee(null)
    }
  }, [handlePanEnd, screenToGrid, circuit.components, circuit.nets, selectComponents, selectNets])

  const findComponentAt = useCallback((screenX: number, screenY: number): string | null => {
    const gp = screenToGrid(screenX, screenY)
    for (const comp of circuit.components) {
      const dx = Math.abs(gp.x - comp.position.x)
      const dy = Math.abs(gp.y - comp.position.y)
      if (dx <= 3 && dy <= 3) return comp.id
    }
    return null
  }, [screenToGrid, circuit.components])

  const handleContextMenu = useCallback((e: any) => {
    e.evt.preventDefault()
    setContextMenu(null)

    if (tool === 'wire') {
      cancelWire()
      return
    }

    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const menuX = rect.left + pointer.x
    const menuY = rect.top + pointer.y

    const clickedCompId = e.target !== stage
      ? findComponentUnderTarget(e.target)
      : findComponentAt(pointer.x, pointer.y)

    if (clickedCompId) {
      const comp = circuit.components.find(c => c.id === clickedCompId)
      if (!comp) return
      const sym = SYMBOL_REGISTRY[comp.type_id]

      if (!selectedComponentIds.has(clickedCompId)) {
        selectComponent(clickedCompId)
      }

      const selCount = selectedComponentIds.has(clickedCompId) ? selectedComponentIds.size : 1

      const items: ContextMenuEntry[] = []

      if (selCount > 1) {
        items.push(
          { label: `${selCount} components selected`, disabled: true, onClick: () => {} },
          { separator: true },
          { label: 'Delete all', shortcut: 'Del', danger: true, onClick: () => removeComponents([...selectedComponentIds]) },
        )
      } else {
        items.push(
          { label: `${sym?.label ?? comp.type_id}${comp.label ? ` (${comp.label})` : ''}`, disabled: true, onClick: () => {} },
          { separator: true },
          { label: 'Rotate 90\u00B0', shortcut: 'R', onClick: () => updateComponent(clickedCompId, { rotation: (comp.rotation + 90) % 360 }) },
          { label: 'Flip horizontal', onClick: () => updateComponent(clickedCompId, { flip_x: !comp.flip_x }) },
          { separator: true },
          { label: 'Delete', shortcut: 'Del', danger: true, onClick: () => removeComponent(clickedCompId) },
        )
      }
      setContextMenu({ x: menuX, y: menuY, items })
    } else {
      // Check if right-clicked on a selected net area — but nets are handled by WireLayer click
      // Show background menu
      const gp = screenToGrid(pointer.x, pointer.y)
      const items: ContextMenuEntry[] = [
        { label: 'Place resistor', onClick: () => addComponent('resistor', gp.x, gp.y) },
        { label: 'Place voltage source', onClick: () => addComponent('dc_voltage', gp.x, gp.y) },
        { label: 'Place ground', onClick: () => addComponent('ground', gp.x, gp.y) },
        { separator: true },
        { label: 'Start wire', shortcut: 'W', onClick: () => setTool('wire') },
        { label: 'Select mode', shortcut: 'S', onClick: () => { setTool('select'); setPlacingTypeId(null) } },
      ]
      setContextMenu({ x: menuX, y: menuY, items })
    }
  }, [tool, cancelWire, findComponentAt, circuit.components, selectedComponentIds, selectComponent, updateComponent, removeComponent, removeComponents, addComponent, screenToGrid, setTool, setPlacingTypeId])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const cursorStyle = tool === 'wire' ? 'crosshair' : tool === 'place' ? 'copy' : 'default'
  const snapTarget = snapIndicator ?? null

  return (
    <div ref={containerRef} className={styles.canvas} style={{ cursor: cursorStyle }}>
      <Stage width={size.width} height={size.height} scaleX={zoom} scaleY={zoom}
        x={viewOffset.x * zoom} y={viewOffset.y * zoom}
        onWheel={handleWheel} onClick={handleStageClick} onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onContextMenu={handleContextMenu}>
        <GridLayer width={size.width} height={size.height} offsetX={viewOffset.x} offsetY={viewOffset.y} zoom={zoom} colors={colors} />
        <WireLayer nets={circuit.nets} selectedNetIds={selectedNetIds} wireStart={wireStart} mousePos={mouseGridPos}
          isWiring={tool === 'wire'} colors={colors} snapTarget={snapTarget} onNetClick={handleNetClick} />
        <ComponentLayer components={circuit.components} selectedIds={selectedComponentIds} colors={colors}
          onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragMove={handleDragMove} onClick={handleComponentClick} tool={tool} hoveredPin={hoveredPin} />
        <OverlayLayer placingTypeId={placingTypeId} mousePos={mouseGridPos} isPlacing={tool === 'place'} colors={colors} selectionRect={marquee} />
      </Stage>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={closeContextMenu} />
      )}
    </div>
  )
}

/** Walk up the Konva node tree to find a component group's ID */
function findComponentUnderTarget(target: any): string | null {
  let node = target
  while (node) {
    if (node.name && node.name() === 'component' && node.id()) {
      return node.id()
    }
    node = node.parent
  }
  return null
}
