import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useTabsStore } from '../../store/tabsStore'
import * as api from '../../api'
import type { TreeEntry } from '../../api'
import styles from './FileExplorer.module.css'

interface Props {
  onOpenCircuit: (projectPath: string, circuitName: string) => Promise<void>
  onOpenFile: (projectPath: string, fileName: string) => Promise<void>
  onNewCircuit: (projectPath: string, circuitName: string) => Promise<void>
  onNewFile: (projectPath: string, fileName: string) => Promise<void>
}

interface TreeNode {
  name: string
  path: string
  kind: 'circuit' | 'file' | 'dir'
  children: TreeNode[]
}

interface ContextMenu {
  x: number
  y: number
  node: TreeNode | null
}

interface Creating {
  parentPath: string
  kind: 'circuit' | 'file' | 'dir'
  value: string
}

interface Editing {
  path: string
  value: string
}

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const map: Record<string, TreeNode> = {}
  for (const e of entries) {
    const node: TreeNode = { name: e.name, path: e.path, kind: e.kind as TreeNode['kind'], children: [] }
    map[e.path] = node
    const slash = e.path.lastIndexOf('/')
    const parentPath = slash >= 0 ? e.path.slice(0, slash) : ''
    if (parentPath === '') {
      root.push(node)
    } else {
      map[parentPath]?.children.push(node)
    }
  }
  return root
}

function flattenTree(
  nodes: TreeNode[],
  depth: number,
  collapsed: Set<string>,
): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = []
  for (const node of nodes) {
    result.push({ node, depth })
    if (node.kind === 'dir' && !collapsed.has(node.path)) {
      result.push(...flattenTree(node.children, depth + 1, collapsed))
    }
  }
  return result
}

export default function FileExplorer({ onOpenCircuit, onOpenFile, onNewCircuit, onNewFile }: Props) {
  const projectPath = useCircuitStore((s) => s.projectPath)
  const { tabs, activeTabId } = useTabsStore()

  const [tree, setTree] = useState<TreeNode[]>([])
  const [projectName, setProjectName] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [creating, setCreating] = useState<Creating | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)

  const creatingInputRef = useRef<HTMLInputElement>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const refresh = useCallback(async () => {
    if (!projectPath) { setTree([]); setProjectName(null); return }
    try {
      const caps = await api.getCapabilities()
      if (caps.file_io) {
        const info = await api.listProject(projectPath)
        setTree(buildTree(info.tree))
        setProjectName(info.name)
      } else {
        const circuits = api.vfsListCircuits(projectPath)
        setTree(circuits.map((c): TreeNode => ({ name: c, path: c, kind: 'circuit', children: [] })))
        setProjectName(projectPath)
      }
    } catch {
      setTree([])
    }
  }, [projectPath])

  useEffect(() => { refresh() }, [refresh])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [contextMenu])

  // Focus creating input when it appears
  useEffect(() => {
    if (creating) setTimeout(() => creatingInputRef.current?.focus(), 0)
  }, [creating])

  // Focus editing input when it appears
  useEffect(() => {
    if (editing) setTimeout(() => editingInputRef.current?.select(), 0)
  }, [editing])

  const toggleCollapse = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  const expandPath = (path: string) => {
    setCollapsed(prev => { const next = new Set(prev); next.delete(path); return next })
  }

  // ── Context menu ──────────────────────────────────────────────────────────

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode | null) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const startCreating = (parentPath: string, kind: Creating['kind']) => {
    if (parentPath) expandPath(parentPath)
    setCreating({ parentPath, kind, value: '' })
    setContextMenu(null)
  }

  const startEditing = (node: TreeNode) => {
    setEditing({ path: node.path, value: node.name })
    setContextMenu(null)
  }

  const handleDelete = async (node: TreeNode) => {
    setContextMenu(null)
    if (!projectPath) return
    const abs = `${projectPath}/${node.path}`
    try {
      await api.deletePath(abs)
      await refresh()
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  // ── Creating ──────────────────────────────────────────────────────────────

  const commitCreate = async () => {
    if (!creating || !projectPath || !creating.value.trim()) {
      setCreating(null); return
    }
    const raw = creating.value.trim()
    const parent = creating.parentPath ? creating.parentPath + '/' : ''
    setCreating(null)
    try {
      if (creating.kind === 'dir') {
        await api.createFolder(`${projectPath}/${parent}${raw}`)
        await refresh()
      } else if (creating.kind === 'circuit') {
        const fileName = raw.endsWith('.eerie') ? raw : raw + '.eerie'
        await onNewCircuit(projectPath, `${parent}${fileName}`)
        await refresh()
      } else {
        await onNewFile(projectPath, `${parent}${raw}`)
        await refresh()
      }
    } catch (e) {
      console.error('Create failed:', e)
    }
  }

  const cancelCreate = () => setCreating(null)

  // ── Editing / rename ──────────────────────────────────────────────────────

  const commitEdit = async () => {
    if (!editing || !projectPath || !editing.value.trim()) {
      setEditing(null); return
    }
    const newName = editing.value.trim()
    const slash = editing.path.lastIndexOf('/')
    const dir = slash >= 0 ? editing.path.slice(0, slash + 1) : ''
    const newPath = dir + newName
    if (newPath === editing.path) { setEditing(null); return }
    setEditing(null)
    try {
      await api.renamePath(`${projectPath}/${editing.path}`, `${projectPath}/${newPath}`)
      await refresh()
    } catch (e) {
      console.error('Rename failed:', e)
    }
  }

  const cancelEdit = () => setEditing(null)

  // ── Active / open detection ───────────────────────────────────────────────

  const isActive = (node: TreeNode) => {
    if (node.kind === 'circuit') {
      return activeTab?.kind === 'circuit' && activeTab.projectPath === projectPath && activeTab.circuitName === node.path
    }
    return activeTab?.kind === 'text' && activeTab.projectPath === projectPath && activeTab.fileName === node.path
  }

  const isOpen = (node: TreeNode) => {
    if (node.kind === 'circuit') {
      return tabs.some(t => t.kind === 'circuit' && t.projectPath === projectPath && t.circuitName === node.path)
    }
    return tabs.some(t => t.kind === 'text' && t.projectPath === projectPath && t.fileName === node.path)
  }

  const handleClick = (node: TreeNode) => {
    if (node.kind === 'dir') { toggleCollapse(node.path); return }
    if (!projectPath) return
    if (node.kind === 'circuit') onOpenCircuit(projectPath, node.path)
    else onOpenFile(projectPath, node.path)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!projectPath) {
    return (
      <div className={styles.explorer}>
        <div className={styles.header}>Explorer</div>
        <div className={styles.empty}>No project open</div>
      </div>
    )
  }

  const flatRows = flattenTree(tree, 0, collapsed)

  // Find where to insert the creating row in the flat list
  let creatingInsertIdx = flatRows.length
  if (creating) {
    if (creating.parentPath === '') {
      creatingInsertIdx = flatRows.length
    } else {
      let last = -1
      for (let i = 0; i < flatRows.length; i++) {
        const p = flatRows[i].node.path
        if (p === creating.parentPath || p.startsWith(creating.parentPath + '/')) last = i
      }
      creatingInsertIdx = last + 1
    }
  }
  const creatingDepth = creating
    ? (creating.parentPath === '' ? 0 : creating.parentPath.split('/').length)
    : 0

  const creatingIcon = creating?.kind === 'circuit' ? '⊡' : creating?.kind === 'dir' ? '▸' : '⊞'
  const creatingPlaceholder = creating?.kind === 'circuit' ? 'circuit name'
    : creating?.kind === 'dir' ? 'folder name' : 'filename'

  return (
    <>
      <div
        className={styles.explorer}
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        <div className={styles.header}>
          <span className={styles.projectName} title={projectPath}>
            {projectName ?? projectPath}
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className={styles.iconBtn} title="New circuit" onClick={() => startCreating('', 'circuit')}>⊡</button>
            <button className={styles.iconBtn} title="New file" onClick={() => startCreating('', 'file')}>⊞</button>
            <button className={styles.iconBtn} title="New folder" onClick={() => startCreating('', 'dir')}>▸</button>
          </div>
        </div>

        <div className={styles.list}>
          {flatRows.map(({ node, depth }, idx) => {
            const indent = 12 + depth * 14
            const active = isActive(node)
            const open = isOpen(node)
            const isCollapsed = node.kind === 'dir' && collapsed.has(node.path)

            return (
              <React.Fragment key={node.path}>
                {/* Insert creating row before this item if needed */}
                {creating && creatingInsertIdx === idx && (
                  <div className={styles.newItem} style={{ paddingLeft: indent }}>
                    <span className={styles.itemIcon}>{creatingIcon}</span>
                    <input
                      ref={creatingInputRef}
                      className={styles.newInput}
                      value={creating.value}
                      placeholder={creatingPlaceholder}
                      onChange={(e) => setCreating(c => c ? { ...c, value: e.target.value } : c)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') cancelCreate() }}
                      onBlur={cancelCreate}
                    />
                  </div>
                )}

                <button
                  className={`${styles.item} ${active ? styles.active : open ? styles.open : ''}`}
                  style={{ paddingLeft: indent }}
                  onClick={() => handleClick(node)}
                  onContextMenu={(e) => handleContextMenu(e, node)}
                  title={node.path}
                >
                  {node.kind === 'dir' && (
                    <span className={styles.folderArrow}>{isCollapsed ? '▸' : '▾'}</span>
                  )}
                  <span className={styles.itemIcon}>
                    {node.kind === 'circuit' ? '⊡' : node.kind === 'dir' ? '' : '⊞'}
                  </span>
                  {editing?.path === node.path ? (
                    <input
                      ref={editingInputRef}
                      className={styles.newInput}
                      style={{ flex: 1 }}
                      value={editing.value}
                      onChange={(e) => setEditing(ed => ed ? { ...ed, value: e.target.value } : ed)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                      onBlur={cancelEdit}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.itemName}>{node.name}</span>
                  )}
                  {open && !active && <span className={styles.openDot} />}
                </button>
              </React.Fragment>
            )
          })}

          {/* Creating row at end of list */}
          {creating && creatingInsertIdx >= flatRows.length && (
            <div className={styles.newItem} style={{ paddingLeft: 12 + creatingDepth * 14 }}>
              <span className={styles.itemIcon}>{creatingIcon}</span>
              <input
                ref={creatingInputRef}
                className={styles.newInput}
                value={creating.value}
                placeholder={creatingPlaceholder}
                onChange={(e) => setCreating(c => c ? { ...c, value: e.target.value } : c)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') cancelCreate() }}
                onBlur={cancelCreate}
              />
            </div>
          )}

          {tree.length === 0 && !creating && (
            <div className={styles.empty}>No files yet</div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Items for dir or background: create actions */}
          {(!contextMenu.node || contextMenu.node.kind === 'dir') && (
            <>
              <button className={styles.contextMenuItem} onClick={() => startCreating(contextMenu.node?.path ?? '', 'circuit')}>
                New Circuit
              </button>
              <button className={styles.contextMenuItem} onClick={() => startCreating(contextMenu.node?.path ?? '', 'file')}>
                New File
              </button>
              <button className={styles.contextMenuItem} onClick={() => startCreating(contextMenu.node?.path ?? '', 'dir')}>
                New Folder
              </button>
            </>
          )}

          {/* Open for files/circuits */}
          {contextMenu.node && contextMenu.node.kind !== 'dir' && (
            <button className={styles.contextMenuItem} onClick={() => { handleClick(contextMenu.node!); setContextMenu(null) }}>
              Open
            </button>
          )}

          {/* Separator before rename/delete */}
          {contextMenu.node && <div className={styles.contextMenuSep} />}

          {contextMenu.node && (
            <>
              <button className={styles.contextMenuItem} onClick={() => startEditing(contextMenu.node!)}>
                Rename
              </button>
              <button className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`} onClick={() => handleDelete(contextMenu.node!)}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
