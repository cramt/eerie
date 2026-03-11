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
  const [isNative, setIsNative] = useState(false)
  const [step, setStep] = useState<Step>(() =>
    currentProjectPath ? 'circuit' : 'project'
  )

  // Project step state
  const [vfsProjects, setVfsProjects] = useState<string[]>([])
  const [nativePathInput, setNativePathInput] = useState('')
  const [newProjectInput, setNewProjectInput] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)

  // Circuit step state
  const [projectPath, setProjectPath] = useState<string>(currentProjectPath ?? '')
  const [projectDisplayName, setProjectDisplayName] = useState(currentProjectPath ?? '')
  const [circuits, setCircuits] = useState<string[]>([])
  const [selectedCircuit, setSelectedCircuit] = useState<string | null>(null)
  const [circuitNameInput, setCircuitNameInput] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nativeInputRef = useRef<HTMLInputElement>(null)
  const circuitInputRef = useRef<HTMLInputElement>(null)
  const newProjectInputRef = useRef<HTMLInputElement>(null)

  // Determine if we're in native mode, then do initial setup
  useEffect(() => {
    api.getCapabilities().then(caps => {
      const native = caps.file_io
      setIsNative(native)
      if (!native && step === 'project') {
        setVfsProjects(api.vfsListProjects())
      }
      if (currentProjectPath) {
        // loadCircuitsForProject uses isNative state, so we pass it directly here
        loadCircuitsForProjectWithNative(currentProjectPath, native)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus inputs
  useEffect(() => {
    if (step === 'project' && isNative) nativeInputRef.current?.focus()
    if (step === 'circuit' && mode === 'save') circuitInputRef.current?.focus()
  }, [step, isNative, mode])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function loadCircuitsForProjectWithNative(path: string, native: boolean) {
    setLoading(true)
    setError(null)
    try {
      if (native) {
        const info = await api.listProject(path)
        setProjectDisplayName(info.name)
        setCircuits(info.circuits.sort())
      } else {
        setProjectDisplayName(path)
        setCircuits(api.vfsListCircuits(path).sort())
      }
      setStep('circuit')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadCircuitsForProject(path: string) {
    return loadCircuitsForProjectWithNative(path, isNative)
  }

  async function handleOpenNativeProject() {
    const path = nativePathInput.trim()
    if (!path) return
    setProjectPath(path)
    await loadCircuitsForProjectWithNative(path, true)
  }

  function handleSelectVfsProject(name: string) {
    setProjectPath(name)
    loadCircuitsForProjectWithNative(name, false)
  }

  async function handleCreateVfsProject() {
    const name = newProjectInput.trim()
    if (!name) return
    await api.createProject(name, name)
    setProjectPath(name)
    setVfsProjects(api.vfsListProjects())
    setCircuits([])
    setStep('circuit')
    setShowNewProject(false)
    setNewProjectInput('')
  }

  function handleSelectCircuit(name: string) {
    setSelectedCircuit(name)
    if (mode === 'save') setCircuitNameInput(name)
  }

  function handleConfirm() {
    if (mode === 'open' && selectedCircuit) {
      onConfirm(projectPath, selectedCircuit)
    } else if (mode === 'save') {
      const name = circuitNameInput.trim()
      if (name) onConfirm(projectPath, name)
    }
  }

  function handleDeleteCircuit(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (isNative) return // can't delete in native mode from UI
    api.vfsDeleteCircuit(projectPath, name)
    setCircuits(api.vfsListCircuits(projectPath).sort())
    if (selectedCircuit === name) setSelectedCircuit(null)
  }

  function handleDeleteProject(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    api.vfsDeleteProject(name)
    setVfsProjects(api.vfsListProjects())
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
            {isNative ? (
              // Native: type a project directory path
              <div className={s.nativePathSection}>
                <label className={s.fieldLabel}>Project directory</label>
                <div className={s.pathRow}>
                  <input
                    ref={nativeInputRef}
                    className={s.nameInput}
                    value={nativePathInput}
                    onChange={e => setNativePathInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleOpenNativeProject() }}
                    placeholder="/home/user/my-project"
                  />
                  <button
                    className={`${s.btn} ${s.btnPrimary}`}
                    disabled={!nativePathInput.trim() || loading}
                    onClick={handleOpenNativeProject}
                  >
                    {loading ? '…' : 'Open'}
                  </button>
                </div>
                {error && <div className={s.errorMsg}>{error}</div>}
              </div>
            ) : (
              // VFS: list projects from localStorage
              <>
                {vfsProjects.length === 0 && !showNewProject ? (
                  <div className={s.empty}>No projects yet.</div>
                ) : (
                  <div className={s.fileList}>
                    {vfsProjects.map(p => (
                      <div
                        key={p}
                        className={s.fileItem}
                        onClick={() => handleSelectVfsProject(p)}
                        onDoubleClick={() => handleSelectVfsProject(p)}
                      >
                        <span>{p}</span>
                        <button className={s.deleteBtn} onClick={(e) => handleDeleteProject(p, e)} title="Delete">del</button>
                      </div>
                    ))}
                  </div>
                )}

                {showNewProject ? (
                  <div className={s.newProjectRow}>
                    <input
                      ref={newProjectInputRef}
                      className={s.nameInput}
                      value={newProjectInput}
                      onChange={e => setNewProjectInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateVfsProject() }}
                      placeholder="project name"
                      autoFocus
                    />
                    <button className={s.btn} onClick={() => setShowNewProject(false)}>×</button>
                    <button
                      className={`${s.btn} ${s.btnPrimary}`}
                      disabled={!newProjectInput.trim()}
                      onClick={handleCreateVfsProject}
                    >
                      Create
                    </button>
                  </div>
                ) : (
                  <button
                    className={s.newItemBtn}
                    onClick={() => { setShowNewProject(true); setTimeout(() => newProjectInputRef.current?.focus(), 0) }}
                  >
                    + New project
                  </button>
                )}
              </>
            )}
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
                  <span>{c}.yaml</span>
                  {!isNative && (
                    <button className={s.deleteBtn} onClick={(e) => handleDeleteCircuit(c, e)} title="Delete">del</button>
                  )}
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
