import React, { useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { getLibraryCategories } from '../../symbols'
import styles from './ComponentPanel.module.css'

const LIBRARY = getLibraryCategories()

export default function ComponentPanel() {
  const { setTool, setPlacingTypeId, tool, placingTypeId } = useUiStore()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filter = search.toLowerCase()
  const filtered = LIBRARY.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (i) => i.label.toLowerCase().includes(filter) || i.id.includes(filter)
    ),
  })).filter((cat) => cat.items.length > 0)

  const handlePick = (typeId: string) => {
    setPlacingTypeId(typeId)
    setTool('place')
  }

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Components</div>
      <input
        className={styles.search}
        placeholder="Search\u2026"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className={styles.list}>
        {filtered.map((cat) => (
          <div key={cat.category} className={styles.category}>
            <button
              className={styles.catLabel}
              onClick={() => toggleCategory(cat.category)}
            >
              <span className={styles.catArrow}>
                {collapsed[cat.category] ? '\u25B8' : '\u25BE'}
              </span>
              {cat.category}
            </button>
            {!collapsed[cat.category] && cat.items.map((item) => (
              <button
                key={item.id}
                className={`${styles.item} ${tool === 'place' && placingTypeId === item.id ? styles.itemActive : ''}`}
                onClick={() => handlePick(item.id)}
                title={`Place ${item.label}`}
              >
                <span className={styles.itemIcon}>{item.label.slice(0, 1)}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className={styles.empty}>No components match "{search}"</p>
        )}
      </div>
    </div>
  )
}
