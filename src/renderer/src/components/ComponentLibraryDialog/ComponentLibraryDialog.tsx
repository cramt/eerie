import React, { useState, useEffect, useCallback } from 'react'
import YAML from 'yaml'
import * as api from '../../api'
import type { ProjectComponent } from '../../store/projectStore'
import { useProjectStore } from '../../store/projectStore'
import { useCircuitStore } from '../../store/circuitStore'
import { SYMBOL_REGISTRY } from '../../symbols'
import { getDefaultProperties } from '../../utils/defaultProperties'
import s from './ComponentLibraryDialog.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse engineering notation: "1k" → 1000, "4.7u" → 4.7e-6, etc. */
function parseEng(raw: string): number | string {
  const t = raw.trim()
  const m = t.match(/^([+-]?\d*\.?\d+)\s*([a-zA-Zµ]*)$/)
  if (!m) { const n = Number(t); return isNaN(n) ? t : n }
  const num = parseFloat(m[1])
  if (isNaN(num)) return t
  const sfx = m[2].toLowerCase()
  const mults: Record<string, number> = {
    g: 1e9, meg: 1e6, k: 1e3, '': 1,
    m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15,
  }
  if (sfx in mults) return num * mults[sfx]
  const stripped = sfx.replace(/[ohmvafh\u03A9]+$/i, '')
  return num * (mults[stripped] ?? 1)
}

const SYMBOL_TYPES = Object.entries(SYMBOL_REGISTRY).map(([id, def]) => ({
  id,
  label: def.label,
  category: def.category,
}))

// Built-in SPICE prefix per type_id for default suggestion
const SPICE_PREFIX: Record<string, string> = {
  resistor: 'R', capacitor: 'C', inductor: 'L',
  dc_voltage: 'V', dc_current: 'I', diode: 'D',
  npn: 'Q', pnp: 'Q', nmos: 'M', pmos: 'M', opamp: 'U', ground: 'GND',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  type_id: string
  name: string
  name_prefix: string
  properties: { key: string; value: string }[]
}

function defaultForm(typeId: string): FormState {
  const def = getDefaultProperties(typeId)
  return {
    type_id: typeId,
    name: SYMBOL_REGISTRY[typeId]?.label ?? typeId,
    name_prefix: SPICE_PREFIX[typeId] ?? '',
    properties: Object.entries(def).map(([k, v]) => ({ key: k, value: String(v) })),
  }
}

function compToForm(comp: ProjectComponent): FormState {
  return {
    type_id: comp.type_id,
    name: comp.name,
    name_prefix: comp.name_prefix ?? '',
    properties: Object.entries(comp.properties).map(([k, v]) => ({ key: k, value: String(v) })),
  }
}

function formToComp(f: FormState): ProjectComponent {
  const properties: Record<string, unknown> = {}
  for (const { key, value } of f.properties) {
    if (key.trim()) properties[key.trim()] = parseEng(value)
  }
  return {
    name: f.name.trim() || (SYMBOL_REGISTRY[f.type_id]?.label ?? f.type_id),
    type_id: f.type_id,
    name_prefix: f.name_prefix.trim() || undefined,
    properties,
  }
}

// ── Persist helpers ───────────────────────────────────────────────────────────

async function persistComponents(projectPath: string, components: ProjectComponent[]) {
  const raw = await api.readManifest(projectPath)
  let manifest: Record<string, unknown> = {}
  try { manifest = YAML.parse(raw) ?? {} } catch { /* keep empty */ }
  manifest.components = components.map(c => ({
    name: c.name,
    type_id: c.type_id,
    ...(c.name_prefix ? { name_prefix: c.name_prefix } : {}),
    properties: c.properties,
  }))
  await api.saveManifest(projectPath, YAML.stringify(manifest))
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  initialView?: 'list' | 'form'
}

export default function ComponentLibraryDialog({ onClose, initialView = 'list' }: Props) {
  const { components, setComponents } = useProjectStore()
  const { projectPath } = useCircuitStore()

  const [view, setView] = useState<'list' | 'form'>(initialView)
  const [editingIdx, setEditingIdx] = useState<number | null>(null) // null = add new
  const [form, setForm] = useState<FormState>(() => defaultForm('resistor'))
  const [saving, setSaving] = useState(false)

  const items = components ?? []

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (view === 'form') setView('list'); else onClose() } }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [view, onClose])

  const save = useCallback(async (next: ProjectComponent[]) => {
    if (!projectPath) return
    setSaving(true)
    try {
      await persistComponents(projectPath, next)
      setComponents(next)
    } finally {
      setSaving(false)
    }
  }, [projectPath, setComponents])

  // ── List view actions ─────────────────────────────────────────────────────

  const handleAdd = () => {
    setForm(defaultForm('resistor'))
    setEditingIdx(null)
    setView('form')
  }

  const handleEdit = (idx: number) => {
    setForm(compToForm(items[idx]))
    setEditingIdx(idx)
    setView('form')
  }

  const handleDelete = async (idx: number) => {
    const next = items.filter((_, i) => i !== idx)
    await save(next)
  }

  const handleMoveUp = async (idx: number) => {
    if (idx === 0) return
    const next = [...items]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    await save(next)
  }

  const handleMoveDown = async (idx: number) => {
    if (idx === items.length - 1) return
    const next = [...items]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    await save(next)
  }

  // ── Form actions ──────────────────────────────────────────────────────────

  const handleTypeChange = (typeId: string) => {
    const def = getDefaultProperties(typeId)
    setForm(f => ({
      ...f,
      type_id: typeId,
      name_prefix: SPICE_PREFIX[typeId] ?? '',
      properties: Object.entries(def).map(([k, v]) => ({ key: k, value: String(v) })),
    }))
  }

  const handleFormSave = async () => {
    const comp = formToComp(form)
    const next = editingIdx !== null
      ? items.map((c, i) => i === editingIdx ? comp : c)
      : [...items, comp]
    await save(next)
    setView('list')
  }

  const addPropRow = () => setForm(f => ({ ...f, properties: [...f.properties, { key: '', value: '' }] }))
  const removePropRow = (i: number) => setForm(f => ({ ...f, properties: f.properties.filter((_, j) => j !== i) }))
  const setPropKey = (i: number, k: string) => setForm(f => {
    const p = [...f.properties]; p[i] = { ...p[i], key: k }; return { ...f, properties: p }
  })
  const setPropVal = (i: number, v: string) => setForm(f => {
    const p = [...f.properties]; p[i] = { ...p[i], value: v }; return { ...f, properties: p }
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={s.dialog}>

        {/* Header */}
        <div className={s.header}>
          {view === 'form' && (
            <button className={s.backBtn} onClick={() => setView('list')}>←</button>
          )}
          <span className={s.title}>
            {view === 'list' ? 'Component Library' : editingIdx !== null ? 'Edit Component' : 'Add Component'}
          </span>
          <button className={s.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div className={s.body}>
          {view === 'list' ? (
            <>
              {items.length === 0 && (
                <div className={s.empty}>No components defined yet.</div>
              )}
              {items.map((comp, idx) => (
                <div key={idx} className={s.item}>
                  <div className={s.itemInfo}>
                    <span className={s.itemName}>{comp.name}</span>
                    <span className={s.itemMeta}>
                      {SYMBOL_REGISTRY[comp.type_id]?.label ?? comp.type_id}
                      {comp.name_prefix ? ` · ${comp.name_prefix}1, ${comp.name_prefix}2…` : ''}
                    </span>
                  </div>
                  <div className={s.itemActions}>
                    <button className={s.iconBtn} onClick={() => handleMoveUp(idx)} disabled={idx === 0} title="Move up">↑</button>
                    <button className={s.iconBtn} onClick={() => handleMoveDown(idx)} disabled={idx === items.length - 1} title="Move down">↓</button>
                    <button className={s.iconBtn} onClick={() => handleEdit(idx)} title="Edit">✎</button>
                    <button className={`${s.iconBtn} ${s.danger}`} onClick={() => handleDelete(idx)} title="Delete">×</button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            /* Form view */
            <div className={s.form}>
              <label className={s.fieldLabel}>Type</label>
              <select
                className={s.select}
                value={form.type_id}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                {SYMBOL_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label} ({t.category})</option>
                ))}
              </select>

              <label className={s.fieldLabel}>Display name</label>
              <input
                className={s.input}
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 10kΩ Resistor"
              />

              <label className={s.fieldLabel}>Label prefix</label>
              <input
                className={s.input}
                value={form.name_prefix}
                onChange={(e) => setForm(f => ({ ...f, name_prefix: e.target.value }))}
                placeholder="e.g. R  →  R1, R2, …"
              />

              <label className={s.fieldLabel}>Default properties</label>
              <div className={s.propsTable}>
                {form.properties.map((p, i) => (
                  <div key={i} className={s.propRow}>
                    <input
                      className={s.propKey}
                      value={p.key}
                      onChange={(e) => setPropKey(i, e.target.value)}
                      placeholder="key"
                    />
                    <input
                      className={s.propVal}
                      value={p.value}
                      onChange={(e) => setPropVal(i, e.target.value)}
                      placeholder="value"
                    />
                    <button className={`${s.iconBtn} ${s.danger}`} onClick={() => removePropRow(i)}>×</button>
                  </div>
                ))}
                <button className={s.addPropBtn} onClick={addPropRow}>+ property</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={s.footer}>
          {view === 'list' ? (
            <>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleAdd}>+ Add component</button>
              <button className={s.btn} onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <button className={s.btn} onClick={() => setView('list')}>Cancel</button>
              <button
                className={`${s.btn} ${s.btnPrimary}`}
                disabled={saving || !form.name.trim()}
                onClick={handleFormSave}
              >
                {saving ? 'Saving…' : editingIdx !== null ? 'Save' : 'Add'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
