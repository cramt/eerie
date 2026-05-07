import React, { useRef } from 'react'
import { useTabsStore, tabDisplayName } from '../../store/tabsStore'
import styles from './TabBar.module.css'

interface Props {
  onCloseTab: (tabId: string) => void
  onNewTab?: () => void
}

export default function TabBar({ onCloseTab, onNewTab }: Props) {
  const { tabs, activeTabId, switchToTab } = useTabsStore()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  if (tabs.length === 0) {
    return (
      <div className={styles.tabBar} data-empty="true">
        <button
          className={styles.newTab}
          onClick={onNewTab}
          title="New circuit  ⌘T"
          aria-label="New tab"
        >
          <span data-mono>+</span>
          <span className={styles.newTabHint}>new</span>
        </button>
      </div>
    )
  }

  return (
    <div className={styles.tabBar}>
      <div className={styles.scroll} ref={scrollRef}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const label = tabDisplayName(tab).replace(/\.eerie$/, '')
          return (
            <div
              key={tab.id}
              className={styles.tab}
              data-active={isActive ? 'true' : undefined}
              onClick={() => switchToTab(tab.id)}
              title={`${tab.projectPath}/${tabDisplayName(tab)}`}
            >
              <span data-mono className={styles.tabName}>
                {label}
                {tab.dirty && <span className={styles.dirtyMark} aria-label="unsaved">*</span>}
              </span>
              <button
                className={styles.closeBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                title="Close  ⌘W"
                aria-label="Close tab"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <button
        className={styles.newTab}
        onClick={onNewTab}
        title="New circuit  ⌘T"
        aria-label="New tab"
      >
        <span data-mono>+</span>
      </button>
    </div>
  )
}
