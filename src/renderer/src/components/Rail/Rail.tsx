import React, { useCallback } from 'react'
import { useUiStore, type RailId } from '../../store/uiStore'
import styles from './Rail.module.css'

interface Props {
  id: RailId
  side: 'left' | 'right'
  label: string
  /** Single-glyph mark drawn in the collapsed rail. Geist Mono, 13px. */
  glyph: string
  /** Keyboard hint shown in collapsed-rail tooltip. */
  shortcut: string
  /** Optional dot tone on collapsed rail to surface state (e.g. unread, dirty). */
  pulse?: 'signal' | 'probe' | 'warn' | null
  /** Optional badge count on collapsed rail. */
  badge?: number
  children?: React.ReactNode
}

export default function Rail({
  id,
  side,
  label,
  glyph,
  shortcut,
  pulse = null,
  badge,
  children,
}: Props) {
  const state = useUiStore((s) => s.rails[id])
  const focusMode = useUiStore((s) => s.focusMode)
  const setRail = useUiStore((s) => s.setRail)
  const cycleRail = useUiStore((s) => s.cycleRail)

  const onCollapsedClick = useCallback(() => {
    setRail(id, 'full')
  }, [id, setRail])

  const onHeaderToggle = useCallback(() => {
    cycleRail(id)
  }, [id, cycleRail])

  const renderState = focusMode ? 'hidden' : state

  return (
    <aside
      className={styles.rail}
      data-state={renderState}
      data-side={side}
      aria-label={label}
    >
      {renderState === 'full' && (
        <div className={styles.full}>
          <div className={styles.body}>{children}</div>
          <button
            className={styles.collapseBtn}
            onClick={onHeaderToggle}
            title={`Collapse ${label} (${shortcut})`}
            aria-label={`Collapse ${label}`}
          >
            {side === 'left' ? '‹' : '›'}
          </button>
        </div>
      )}

      {renderState === 'collapsed' && (
        <button
          className={styles.collapsed}
          onClick={onCollapsedClick}
          title={`${label} (${shortcut})`}
          aria-label={`${label}: expand`}
        >
          <span className={styles.glyph}>{glyph}</span>
          {pulse && <span className={styles.dot} data-tone={pulse} />}
          {typeof badge === 'number' && badge > 0 && (
            <span className={styles.badge} data-mono>{badge > 99 ? '99+' : badge}</span>
          )}
          <span className={styles.collapsedTooltip}>
            <span>{label}</span>
            <span className={styles.shortcut} data-mono>{shortcut}</span>
          </span>
        </button>
      )}

      {renderState === 'hidden' && (
        <div
          className={styles.edge}
          onClick={onCollapsedClick}
          title={`${label} (${shortcut})`}
          role="button"
          aria-label={`${label}: reveal`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onCollapsedClick()
            }
          }}
        />
      )}
    </aside>
  )
}
