import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import {
  getProgressItems,
  getMyProgressChecks,
  checkProgressItem,
  uncheckProgressItem,
  createProgressItem,
  updateProgressItem,
  deleteProgressItem,
  type ProgressItem,
} from '@/lib/progress-queries'

interface Props {
  skillNodeId: string
  isEditing: boolean
}

export function ProgressPage({ skillNodeId, isEditing }: Props) {
  const [items, setItems] = useState<ProgressItem[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editSection, setEditSection] = useState('')
  const [addingSection, setAddingSection] = useState<string | null>(null)
  const [newItemText, setNewItemText] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [addingNewSection, setAddingNewSection] = useState(false)
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameSectionText, setRenameSectionText] = useState('')

  // Mass import
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getProgressItems(skillNodeId),
      getMyProgressChecks(skillNodeId),
    ]).then(([its, chk]) => {
      setItems(its)
      setChecked(chk)
      setLoading(false)
    })
  }, [skillNodeId])

  // Group items by section, preserving section order from sort_order
  const sections = useMemo(() => {
    const map = new Map<string, ProgressItem[]>()
    for (const item of items) {
      if (!map.has(item.section)) map.set(item.section, [])
      map.get(item.section)!.push(item)
    }
    return map
  }, [items])

  const totalChecked = items.filter(i => checked.has(i.id)).length

  const handleToggle = async (itemId: string) => {
    const next = new Set(checked)
    if (next.has(itemId)) {
      next.delete(itemId)
      setChecked(next)
      await uncheckProgressItem(itemId)
    } else {
      next.add(itemId)
      setChecked(next)
      await checkProgressItem(itemId)
    }
  }

  const startEdit = (item: ProgressItem) => {
    setEditingId(item.id)
    setEditText(item.text)
    setEditSection(item.section)
  }

  const saveEdit = async () => {
    if (!editingId) return
    await updateProgressItem(editingId, { text: editText, section: editSection })
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, text: editText, section: editSection } : i))
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    await deleteProgressItem(id)
    setItems(prev => prev.filter(i => i.id !== id))
    setChecked(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleAddItem = async (section: string) => {
    if (!newItemText.trim()) return
    const sortOrder = (items.filter(i => i.section === section).length) + 1
    const item = await createProgressItem(skillNodeId, section, newItemText.trim(), sortOrder)
    setItems(prev => [...prev, item])
    setNewItemText('')
    setAddingSection(null)
  }

  const handleDeleteSection = async (section: string) => {
    if (!confirm(`Delete the entire "${section}" section and all its items?`)) return
    const ids = items.filter(i => i.section === section).map(i => i.id)
    await Promise.all(ids.map(id => deleteProgressItem(id)))
    setItems(prev => prev.filter(i => i.section !== section))
    setChecked(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
  }

  const handleRenameSection = async (oldName: string) => {
    const newName = renameSectionText.trim()
    if (!newName || newName === oldName) { setRenamingSection(null); return }
    const ids = items.filter(i => i.section === oldName).map(i => i.id)
    await Promise.all(ids.map(id => updateProgressItem(id, { section: newName })))
    setItems(prev => prev.map(i => i.section === oldName ? { ...i, section: newName } : i))
    setRenamingSection(null)
  }

  const handleAddNewSection = async () => {
    if (!newSectionName.trim() || !newItemText.trim()) return
    const item = await createProgressItem(skillNodeId, newSectionName.trim(), newItemText.trim(), 1)
    setItems(prev => [...prev, item])
    setNewSectionName('')
    setNewItemText('')
    setAddingNewSection(false)
  }

  const handleImport = async () => {
    setImportError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(importJson)
    } catch {
      setImportError('Invalid JSON — check your syntax and try again.')
      return
    }
    if (!Array.isArray(parsed)) {
      setImportError('Expected a JSON array at the top level.')
      return
    }
    const groups = parsed as { section?: unknown; items?: unknown }[]
    for (const g of groups) {
      if (typeof g.section !== 'string' || !g.section.trim()) {
        setImportError('Each entry must have a "section" string.')
        return
      }
      if (!Array.isArray(g.items) || g.items.some(i => typeof i !== 'string')) {
        setImportError(`Section "${g.section}": "items" must be an array of strings.`)
        return
      }
    }
    setImporting(true)
    try {
      const created: ProgressItem[] = []
      for (const g of groups) {
        const section = (g.section as string).trim()
        const existingInSection = items.filter(i => i.section === section).length
        const sectionItems = g.items as string[]
        for (let idx = 0; idx < sectionItems.length; idx++) {
          const text = sectionItems[idx].trim()
          if (!text) continue
          const item = await createProgressItem(skillNodeId, section, text, existingInSection + idx + 1)
          created.push(item)
        }
      }
      setItems(prev => [...prev, ...created])
      setShowImport(false)
      setImportJson('')
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
      </div>
    )
  }

  if (items.length === 0 && !isEditing) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-400">No progress checklist defined for this skill yet.</p>
      </div>
    )
  }

  return (
    <div className="mt-6 pb-32">
      {/* Mass import button */}
      {isEditing && (
        <div className="mb-5">
          <button
            onClick={() => { setShowImport(true); setImportError(null) }}
            className="cursor-pointer flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-900 hover:text-gray-900 transition-colors"
          >
            <Upload className="h-4 w-4" /> Import JSON
          </button>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col gap-4 p-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Import progress items</h3>
              <p className="mt-1 text-sm text-gray-500">
                Paste a JSON array of sections. Each entry needs a <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">section</code> string and an <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">items</code> array of strings.
              </p>
              <pre className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500 overflow-x-auto">{`[
  { "section": "Climbing Grades", "items": ["5a", "5b", "6a", "6b", "7a"] },
  { "section": "Physical Feats", "items": ["One arm pull-up", "Hang 20mm 20s"] }
]`}</pre>
            </div>

            <textarea
              autoFocus
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setImportError(null) }}
              placeholder="Paste your JSON here…"
              rows={10}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-sm outline-none transition focus:border-black focus:bg-white"
            />

            {importError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                {importError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowImport(false); setImportJson(''); setImportError(null) }}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importJson.trim()}
                className="cursor-pointer rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {items.length > 0 && (
        <div className="mb-6 flex items-center gap-4">
          <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gray-900 transition-all duration-300"
              style={{ width: `${items.length ? (totalChecked / items.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-gray-500 shrink-0">
            {totalChecked} / {items.length}
          </span>
        </div>
      )}

      {/* Sections */}
      <div className="flex flex-col gap-8">
        {[...sections.entries()].map(([section, sectionItems]) => (
          <div key={section}>
            {/* Section header row */}
            <div className="flex items-center gap-2 mb-3">
              {renamingSection === section ? (
                <>
                  <input
                    autoFocus
                    value={renameSectionText}
                    onChange={e => setRenameSectionText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameSection(section); if (e.key === 'Escape') setRenamingSection(null) }}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-gray-600 outline-none focus:border-black"
                  />
                  <button onClick={() => handleRenameSection(section)} className="cursor-pointer rounded-lg bg-black px-2 py-0.5 text-xs text-white">Save</button>
                  <button onClick={() => setRenamingSection(null)} className="cursor-pointer rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-500">Cancel</button>
                </>
              ) : (
                <>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    {section}
                  </h3>
                  {isEditing && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => { setRenamingSection(section); setRenameSectionText(section) }}
                        className="cursor-pointer rounded-lg px-2 py-0.5 text-xs text-gray-300 hover:text-gray-600"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteSection(section)}
                        className="cursor-pointer rounded-lg p-1 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-1">
              {sectionItems.map(item => {
                const isChecked = checked.has(item.id)
                const isEditingItem = editingId === item.id

                return (
                  <div
                    key={item.id}
                    className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 ${isChecked ? 'bg-gray-50' : ''}`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggle(item.id)}
                      className={`mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border transition-colors ${
                        isChecked
                          ? 'border-gray-900 bg-gray-900'
                          : 'border-gray-300 bg-white hover:border-gray-500'
                      }`}
                    >
                      {isChecked && (
                        <svg viewBox="0 0 10 8" fill="none" className="w-full h-full p-0.5">
                          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    {/* Text */}
                    {isEditingItem ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          autoFocus
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-black"
                        />
                        <input
                          value={editSection}
                          onChange={e => setEditSection(e.target.value)}
                          placeholder="Section"
                          className="w-32 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 outline-none focus:border-black"
                        />
                        <button onClick={saveEdit} className="cursor-pointer rounded-lg bg-black px-2 py-1 text-xs text-white">Save</button>
                        <button onClick={() => setEditingId(null)} className="cursor-pointer rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500">Cancel</button>
                      </div>
                    ) : (
                      <span className={`flex-1 text-sm leading-relaxed ${isChecked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {item.text}
                      </span>
                    )}

                    {/* Editor controls — only when page is in edit mode and this item isn't being renamed */}
                    {isEditing && !isEditingItem && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(item)}
                          className="cursor-pointer rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:text-gray-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="cursor-pointer rounded-lg p-1 text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Editor: add item to this section */}
              {isEditing && (
                addingSection === section ? (
                  <div className="flex items-center gap-2 mt-1 pl-3">
                    <div className="h-4 w-4 shrink-0 rounded border border-gray-200" />
                    <input
                      autoFocus
                      value={newItemText}
                      onChange={e => setNewItemText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddItem(section); if (e.key === 'Escape') setAddingSection(null) }}
                      placeholder="New item…"
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-black"
                    />
                    <button onClick={() => handleAddItem(section)} className="cursor-pointer rounded-lg bg-black px-2 py-1 text-xs text-white">Add</button>
                    <button onClick={() => setAddingSection(null)} className="cursor-pointer rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingSection(section); setNewItemText('') }}
                    className="cursor-pointer flex items-center gap-1.5 pl-3 mt-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add item
                  </button>
                )
              )}
            </div>
          </div>
        ))}

        {/* Editor: add new section */}
        {isEditing && (
          <div>
            {addingNewSection ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-4 flex flex-col gap-3">
                <input
                  autoFocus
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  placeholder="Section name (e.g. Climbing Grades, Physical Feats)"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                />
                <div className="flex items-center gap-2">
                  <input
                    value={newItemText}
                    onChange={e => setNewItemText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddNewSection() }}
                    placeholder="First item in this section"
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                  <button onClick={handleAddNewSection} className="cursor-pointer rounded-xl bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800">
                    Create
                  </button>
                  <button onClick={() => setAddingNewSection(false)} className="cursor-pointer rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingNewSection(true)}
                className="cursor-pointer flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 px-5 py-3 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 w-full"
              >
                <Plus className="h-4 w-4" /> Add section
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
