import React, { useEffect, useRef } from 'react'
import styles from './ContextMenu.module.css'

export interface ContextMenuItem {
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export interface ContextMenuSeparator {
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface Props {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'separator' in entry
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${x - rect.width}px`
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${y - rect.height}px`
    }
  }, [x, y])

  return (
    <div ref={ref} className={styles.menu} style={{ left: x, top: y }}>
      {items.map((entry, i) => {
        if (isSeparator(entry)) {
          return <div key={i} className={styles.separator} />
        }
        return (
          <button
            key={i}
            className={`${styles.item} ${entry.danger ? styles.danger : ''} ${entry.disabled ? styles.disabled : ''}`}
            onClick={() => {
              if (!entry.disabled) {
                entry.onClick()
                onClose()
              }
            }}
            disabled={entry.disabled}
          >
            <span className={styles.label}>{entry.label}</span>
            {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}
