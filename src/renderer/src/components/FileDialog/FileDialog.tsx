import React, { useState, useEffect, useRef } from 'react'
import { vfsListFiles, vfsDeleteFile } from '../../api'
import s from './FileDialog.module.css'

export type FileDialogMode = 'open' | 'save'

interface Props {
  mode: FileDialogMode
  suggestedName?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function FileDialog({ mode, suggestedName, onConfirm, onCancel }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState(suggestedName ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFiles(vfsListFiles())
  }, [])

  useEffect(() => {
    if (mode === 'save') inputRef.current?.focus()
  }, [mode])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const handleConfirm = () => {
    if (mode === 'open' && selected) onConfirm(selected)
    if (mode === 'save' && name.trim()) {
      const n = name.trim().endsWith('.eerie') ? name.trim() : name.trim() + '.eerie'
      onConfirm(n)
    }
  }

  const handleDelete = (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    vfsDeleteFile(fileName)
    setFiles(vfsListFiles())
    if (selected === fileName) setSelected(null)
  }

  const handleFileClick = (fileName: string) => {
    setSelected(fileName)
    if (mode === 'save') setName(fileName)
  }

  const handleFileDoubleClick = (fileName: string) => {
    if (mode === 'open') onConfirm(fileName)
  }

  const canConfirm = mode === 'open' ? selected != null : name.trim().length > 0

  return (
    <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={s.dialog}>
        <div className={s.header}>
          <span className={s.title}>{mode === 'open' ? 'Open Circuit' : 'Save Circuit As'}</span>
          <button className={s.closeBtn} onClick={onCancel}>&times;</button>
        </div>

        <div className={s.body}>
          {files.length === 0 ? (
            <div className={s.empty}>
              {mode === 'open' ? 'No saved circuits yet.' : 'No existing circuits.'}
            </div>
          ) : (
            <div className={s.fileList}>
              {files.map(f => (
                <div
                  key={f}
                  className={`${s.fileItem} ${selected === f ? s.fileItemSelected : ''}`}
                  onClick={() => handleFileClick(f)}
                  onDoubleClick={() => handleFileDoubleClick(f)}
                >
                  <span>{f}</span>
                  <button className={s.deleteBtn} onClick={(e) => handleDelete(f, e)} title="Delete">
                    del
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.footer}>
          {mode === 'save' && (
            <input
              ref={inputRef}
              className={s.nameInput}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canConfirm) handleConfirm() }}
              placeholder="circuit.eerie"
            />
          )}
          <button className={s.btn} onClick={onCancel}>Cancel</button>
          <button
            className={`${s.btn} ${s.btnPrimary}`}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {mode === 'open' ? 'Open' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
