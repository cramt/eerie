import React, { useEffect, useState, useCallback } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import { useTabsStore } from '../../store/tabsStore'
import * as api from '../../api'
import styles from './FileExplorer.module.css'

interface Props {
  onOpenCircuit: (projectPath: string, circuitName: string) => Promise<void>
  onOpenFile: (projectPath: string, fileName: string) => Promise<void>
  onNewCircuit: (projectPath: string, circuitName: string) => Promise<void>
  onNewFile: (projectPath: string, fileName: string) => Promise<void>
}

interface FileEntry {
  name: string
  kind: 'circuit' | 'file'
}

export default function FileExplorer({ onOpenCircuit, onOpenFile, onNewCircuit, onNewFile }: Props) {
  const projectPath = useCircuitStore((s) => s.projectPath)
  const { tabs, activeTabId } = useTabsStore()

  const [allFiles, setAllFiles] = useState<FileEntry[]>([])
  const [projectName, setProjectName] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setAllFiles([])
      setProjectName(null)
      return
    }
    try {
      const caps = await api.getCapabilities()
      if (caps.file_io) {
        const info = await api.listProject(projectPath)
        const entries: FileEntry[] = [
          ...info.circuits.map((c): FileEntry => ({ name: c, kind: 'circuit' })),
          ...info.files.map((f): FileEntry => ({ name: f, kind: 'file' })),
        ].sort((a, b) => a.name.localeCompare(b.name))
        setAllFiles(entries)
        setProjectName(info.name)
      } else {
        const circuits = api.vfsListCircuits(projectPath)
        setAllFiles(circuits.map((c): FileEntry => ({ name: c, kind: 'circuit' })))
        setProjectName(projectPath)
      }
    } catch {
      setAllFiles([])
    }
  }, [projectPath])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async () => {
    if (!projectPath || !newName.trim()) return
    const raw = newName.trim()
    setIsCreating(false)
    setNewName('')
    // If no extension or .eerie extension, create a circuit; otherwise create a text file
    const hasExtension = raw.includes('.')
    if (!hasExtension || raw.endsWith('.eerie')) {
      const fileName = raw.endsWith('.eerie') ? raw : raw + '.eerie'
      await onNewCircuit(projectPath, fileName)
    } else {
      await onNewFile(projectPath, raw)
    }
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

  function isActive(entry: FileEntry) {
    if (entry.kind === 'circuit') {
      return activeTab?.kind === 'circuit' && activeTab.projectPath === projectPath && activeTab.circuitName === entry.name
    }
    return activeTab?.kind === 'text' && activeTab.projectPath === projectPath && activeTab.fileName === entry.name
  }

  function isOpen(entry: FileEntry) {
    if (entry.kind === 'circuit') {
      return tabs.some(
        (t) => t.kind === 'circuit' && t.projectPath === projectPath && t.circuitName === entry.name,
      )
    }
    return tabs.some(
      (t) => t.kind === 'text' && t.projectPath === projectPath && t.fileName === entry.name,
    )
  }

  function handleClick(entry: FileEntry) {
    if (entry.kind === 'circuit') {
      onOpenCircuit(projectPath!, entry.name)
    } else {
      onOpenFile(projectPath!, entry.name)
    }
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.projectName} title={projectPath}>
          {projectName ?? projectPath}
        </span>
        <button
          className={styles.iconBtn}
          title="New file"
          onClick={() => setIsCreating(true)}
        >
          +
        </button>
      </div>

      <div className={styles.list}>
        {allFiles.map((entry) => {
          const active = isActive(entry)
          const open = isOpen(entry)
          return (
            <button
              key={entry.name}
              className={`${styles.item} ${active ? styles.active : open ? styles.open : ''}`}
              onClick={() => handleClick(entry)}
              title={entry.name}
            >
              <span className={styles.itemIcon}>{entry.kind === 'circuit' ? '⊡' : '⊞'}</span>
              <span className={styles.itemName}>{entry.name}</span>
              {open && !active && <span className={styles.openDot} />}
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
              placeholder="filename"
            />
          </div>
        )}

        {allFiles.length === 0 && !isCreating && (
          <div className={styles.empty}>No files yet</div>
        )}
      </div>
    </div>
  )
}
