import React, { useEffect, useState, useCallback } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useTabsStore } from '../../store/tabsStore'
import * as api from '../../api'
import styles from './FileExplorer.module.css'

interface Props {
  onOpenCircuit: (projectPath: string, circuitName: string) => Promise<void>
  onNewCircuit: (projectPath: string, circuitName: string) => Promise<void>
}

export default function FileExplorer({ onOpenCircuit, onNewCircuit }: Props) {
  const projectPath = useCircuitStore((s) => s.projectPath)
  const { tabs, activeTabId } = useTabsStore()

  const [circuits, setCircuits] = useState<string[]>([])
  const [projectName, setProjectName] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setCircuits([])
      setProjectName(null)
      return
    }
    try {
      const caps = await api.getCapabilities()
      if (caps.file_io) {
        const info = await api.listProject(projectPath)
        setCircuits(info.circuits)
        setProjectName(info.name)
      } else {
        setCircuits(api.vfsListCircuits(projectPath))
        setProjectName(projectPath)
      }
    } catch {
      setCircuits([])
    }
  }, [projectPath])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async () => {
    if (!projectPath || !newName.trim()) return
    const name = newName.trim()
    setIsCreating(false)
    setNewName('')
    await onNewCircuit(projectPath, name)
    await refresh()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
  }

  if (!projectPath) {
    return (
      <div className={styles.explorer}>
        <div className={styles.header}>Explorer</div>
        <div className={styles.empty}>No project open</div>
      </div>
    )
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.projectName} title={projectPath}>
          {projectName ?? projectPath}
        </span>
        <button
          className={styles.iconBtn}
          title="New circuit"
          onClick={() => setIsCreating(true)}
        >
          +
        </button>
      </div>

      <div className={styles.list}>
        {circuits.map((name) => {
          const isOpen = tabs.some(
            (t) => t.projectPath === projectPath && t.circuitName === name,
          )
          const isActive =
            activeTab?.projectPath === projectPath && activeTab?.circuitName === name
          return (
            <button
              key={name}
              className={`${styles.item} ${isActive ? styles.active : isOpen ? styles.open : ''}`}
              onClick={() => onOpenCircuit(projectPath, name)}
              title={name}
            >
              <span className={styles.itemIcon}>⊡</span>
              <span className={styles.itemName}>{name}</span>
              {isOpen && !isActive && <span className={styles.openDot} />}
            </button>
          )
        })}

        {isCreating && (
          <div className={styles.newItem}>
            <span className={styles.itemIcon}>⊡</span>
            <input
              className={styles.newInput}
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => { setIsCreating(false); setNewName('') }}
              placeholder="circuit-name"
            />
          </div>
        )}

        {circuits.length === 0 && !isCreating && (
          <div className={styles.empty}>No circuits yet</div>
        )}
      </div>
    </div>
  )
}
