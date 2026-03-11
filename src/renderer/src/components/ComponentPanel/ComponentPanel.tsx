import React, { useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { getLibraryCategories, SYMBOL_REGISTRY } from '../../symbols'
import styles from './ComponentPanel.module.css'

const GENERIC_LIBRARY = getLibraryCategories()

export default function ComponentPanel() {
  const { setTool, setPlacingTypeId, setPlacingPreset, tool, placingTypeId } = useUiStore()
  const { components: projectComponents } = useProjectStore()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filter = search.toLowerCase()

  const handlePickGeneric = (typeId: string) => {
    setPlacingTypeId(typeId)
    setPlacingPreset(null)
    setTool('place')
  }

  const handlePickProject = (idx: number) => {
    if (!projectComponents) return
    const comp = projectComponents[idx]
    setPlacingTypeId(comp.type_id)
    setPlacingPreset({ properties: comp.properties, namePrefix: comp.name_prefix })
    setTool('place')
  }

  // Project-defined component library
  if (projectComponents !== null) {
    const filtered = projectComponents
      .map((c, idx) => ({ ...c, idx }))
      .filter(c =>
        c.name.toLowerCase().includes(filter) ||
        c.type_id.includes(filter)
      )

    // Group by the symbol registry category
    const byCategory: Record<string, typeof filtered> = {}
    for (const c of filtered) {
      const cat = SYMBOL_REGISTRY[c.type_id]?.category ?? 'Other'
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(c)
    }
    const categories = Object.entries(byCategory)

    return (
      <div className={styles.panel}>
        <div className={styles.header}>Components</div>
        <input
          className={styles.search}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.list}>
          {categories.map(([cat, items]) => (
            <div key={cat} className={styles.category}>
              <div className={styles.catLabel}>{cat}</div>
              {items.map((item) => {
                const isActive = tool === 'place' && placingTypeId === item.type_id
                return (
                  <button
                    key={item.idx}
                    className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                    onClick={() => handlePickProject(item.idx)}
                    title={`Place ${item.name}`}
                  >
                    <span className={styles.itemIcon}>
                      {(SYMBOL_REGISTRY[item.type_id]?.label ?? item.type_id).slice(0, 1)}
                    </span>
                    <span>{item.name}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {categories.length === 0 && (
            <p className={styles.empty}>No components match "{search}"</p>
          )}
        </div>
      </div>
    )
  }

  // Generic built-in library (no project components defined)
  const filtered = GENERIC_LIBRARY.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (i) => i.label.toLowerCase().includes(filter) || i.id.includes(filter)
    ),
  })).filter((cat) => cat.items.length > 0)

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Components</div>
      <input
        className={styles.search}
        placeholder="Search…"
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
                {collapsed[cat.category] ? '▸' : '▾'}
              </span>
              {cat.category}
            </button>
            {!collapsed[cat.category] && cat.items.map((item) => (
              <button
                key={item.id}
                className={`${styles.item} ${tool === 'place' && placingTypeId === item.id ? styles.itemActive : ''}`}
                onClick={() => handlePickGeneric(item.id)}
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
