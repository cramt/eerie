import React, { useState, useEffect, useRef } from 'react'
import * as api from '../../api'
import s from './FileDialog.module.css'

export type FileDialogMode = 'open' | 'save'

interface Props {
  mode: FileDialogMode
  /** If set (save mode), skip the project step and go straight to circuit naming. */
  currentProjectPath?: string
  onConfirm: (projectPath: string, circuitName: string) => void
  onCancel: () => void
}

type Step = 'project' | 'circuit'

export default function FileDialog({ mode, currentProjectPath, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<Step>(() =>
    currentProjectPath ? 'circuit' : 'project'
  )

  // Project step state
  const [pathInput, setPathInput] = useState('')

  // Circuit step state
  const [projectPath, setProjectPath] = useState<string>(currentProjectPath ?? '')
  const [projectDisplayName, setProjectDisplayName] = useState(currentProjectPath ?? '')
  const [circuits, setCircuits] = useState<string[]>([])
  const [selectedCircuit, setSelectedCircuit] = useState<string | null>(null)
  const [circuitNameInput, setCircuitNameInput] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pathInputRef = useRef<HTMLInputElement>(null)
  const circuitInputRef = useRef<HTMLInputElement>(null)

  // Load circuits for the current project if one was provided
  useEffect(() => {
    if (currentProjectPath) {
      loadCircuitsForProject(currentProjectPath)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus inputs
  useEffect(() => {
    if (step === 'project') pathInputRef.current?.focus()
    if (step === 'circuit' && mode === 'save') circuitInputRef.current?.focus()
  }, [step, mode])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function loadCircuitsForProject(path: string) {
    setLoading(true)
    setError(null)
    try {
      const info = await api.listProject(path)
      setProjectDisplayName(info.name)
      setCircuits(info.circuits.sort())
      setStep('circuit')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenProject() {
    const path = pathInput.trim()
    if (!path) return
    setProjectPath(path)
    await loadCircuitsForProject(path)
  }

  function handleSelectCircuit(name: string) {
    setSelectedCircuit(name)
    if (mode === 'save') setCircuitNameInput(name)
  }

  function handleConfirm() {
    if (mode === 'open' && selectedCircuit) {
      onConfirm(projectPath, selectedCircuit)
    } else if (mode === 'save') {
      const raw = circuitNameInput.trim()
      if (!raw) return
      const name = raw.endsWith('.eerie') ? raw : raw + '.eerie'
      onConfirm(projectPath, name)
    }
  }

  async function handleDeleteCircuit(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await api.deletePath(`${projectPath}/${name}`)
      const info = await api.listProject(projectPath)
      setCircuits(info.circuits.sort())
      if (selectedCircuit === name) setSelectedCircuit(null)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const canConfirmCircuit = mode === 'open'
    ? selectedCircuit != null
    : circuitNameInput.trim().length > 0

  // ── Project step ─────────────────────────────────────────────────────────

  if (step === 'project') {
    return (
      <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
        <div className={s.dialog}>
          <div className={s.header}>
            <span className={s.title}>{mode === 'open' ? 'Open Project' : 'Save Circuit'}</span>
            <button className={s.closeBtn} onClick={onCancel}>&times;</button>
          </div>

          <div className={s.body}>
            <div className={s.nativePathSection}>
              <label className={s.fieldLabel}>Project directory</label>
              <div className={s.pathRow}>
                <input
                  ref={pathInputRef}
                  className={s.nameInput}
                  value={pathInput}
                  onChange={e => setPathInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleOpenProject() }}
                  placeholder="/home/user/my-project"
                />
                <button
                  className={`${s.btn} ${s.btnPrimary}`}
                  disabled={!pathInput.trim() || loading}
                  onClick={handleOpenProject}
                >
                  {loading ? '…' : 'Open'}
                </button>
              </div>
              {error && <div className={s.errorMsg}>{error}</div>}
            </div>
          </div>

          <div className={s.footer}>
            <button className={s.btn} onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Circuit step ─────────────────────────────────────────────────────────

  return (
    <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={s.dialog}>
        <div className={s.header}>
          <div className={s.headerLeft}>
            {!currentProjectPath && (
              <button className={s.backBtn} onClick={() => { setStep('project'); setError(null) }}>←</button>
            )}
            <div>
              <span className={s.title}>
                {mode === 'open' ? 'Open Circuit' : 'Save Circuit As'}
              </span>
              <span className={s.projectLabel}>{projectDisplayName}</span>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onCancel}>&times;</button>
        </div>

        <div className={s.body}>
          {circuits.length === 0 ? (
            <div className={s.empty}>
              {mode === 'open' ? 'No circuits in this project yet.' : 'No existing circuits.'}
            </div>
          ) : (
            <div className={s.fileList}>
              {circuits.map(c => (
                <div
                  key={c}
                  className={`${s.fileItem} ${selectedCircuit === c ? s.fileItemSelected : ''}`}
                  onClick={() => handleSelectCircuit(c)}
                  onDoubleClick={() => { handleSelectCircuit(c); if (mode === 'open') onConfirm(projectPath, c) }}
                >
                  <span>{c}</span>
                  <button className={s.deleteBtn} onClick={(e) => handleDeleteCircuit(c, e)} title="Delete">del</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.footer}>
          {mode === 'save' && (
            <input
              ref={circuitInputRef}
              className={s.nameInput}
              value={circuitNameInput}
              onChange={e => setCircuitNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canConfirmCircuit) handleConfirm() }}
              placeholder="circuit name"
            />
          )}
          <button className={s.btn} onClick={onCancel}>Cancel</button>
          <button
            className={`${s.btn} ${s.btnPrimary}`}
            disabled={!canConfirmCircuit}
            onClick={handleConfirm}
          >
            {mode === 'open' ? 'Open' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
