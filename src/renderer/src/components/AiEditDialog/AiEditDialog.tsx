import React, { useRef, useState, useEffect, useCallback } from 'react'
import styles from './AiEditDialog.module.css'

interface AiEditDialogProps {
  x: number
  y: number
  focusedComponentId?: string
  onClose: () => void
  onApply: (instruction: string) => Promise<void>
}

export default function AiEditDialog({ x, y, focusedComponentId, onClose, onApply }: AiEditDialogProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Clamp position to viewport
  const dialogRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    if (dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      setPos({
        left: Math.min(x, vw - rect.width - 12),
        top: Math.min(y, vh - rect.height - 12),
      })
    }
    textareaRef.current?.focus()
  }, [x, y])

  const handleApply = useCallback(async () => {
    const trimmed = instruction.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    try {
      await onApply(trimmed)
    } catch (e) {
      setError(String(e))
      setLoading(false)
    }
  }, [instruction, loading, onApply])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleApply()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }, [handleApply, onClose])

  return (
    <div
      ref={dialogRef}
      className={styles.dialog}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className={styles.header}>
        <span>Edit with AI</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      {focusedComponentId && (
        <div className={styles.focusBadge}>Focus: {focusedComponentId}</div>
      )}
      <div className={styles.body}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder="Describe the edit, e.g. &quot;add a 10kΩ pull-up from VCC to output&quot;"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={3}
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.footer}>
          <span className={styles.hint}>Enter to apply · Shift+Enter for newline</span>
          <button
            className={styles.applyBtn}
            onClick={handleApply}
            disabled={loading || !instruction.trim()}
          >
            {loading ? 'Thinking…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
