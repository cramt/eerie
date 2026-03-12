import React from 'react'
import { useTabsStore, tabDisplayName } from '../../store/tabsStore'
import styles from './TabBar.module.css'

interface Props {
  onCloseTab: (tabId: string) => void
}

export default function TabBar({ onCloseTab }: Props) {
  const { tabs, activeTabId, switchToTab } = useTabsStore()

  if (tabs.length === 0) return null

  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const label = tabDisplayName(tab)
        return (
          <div
            key={tab.id}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => switchToTab(tab.id)}
            title={`${tab.projectPath}/${tabDisplayName(tab)}`}
          >
            <span className={styles.tabName}>
              {tab.dirty && <span className={styles.dirtyDot}>●</span>}
              {label}
            </span>
            <button
              className={styles.closeBtn}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
              title="Close"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
