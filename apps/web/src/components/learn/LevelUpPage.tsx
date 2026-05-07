import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react'
import {
  getSkillLevels,
  getMySkillLevel,
  claimSkillLevel,
  unclaimSkillLevel,
  createSkillLevel,
  updateSkillLevel,
  deleteSkillLevel,
  type SkillLevel,
} from '@/lib/levelup-queries'

interface Props {
  skillNodeId: string
  isEditing: boolean
}

export function LevelUpPage({ skillNodeId, isEditing }: Props) {
  const [levels, setLevels] = useState<SkillLevel[]>([])
  const [myLevelId, setMyLevelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<SkillLevel>>({})
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getSkillLevels(skillNodeId),
      getMySkillLevel(skillNodeId),
    ]).then(([lvls, mine]) => {
      setLevels(lvls)
      setMyLevelId(mine?.level_id ?? null)
      // Auto-expand claimed level
      if (mine?.level_id) setExpanded(new Set([mine.level_id]))
      setLoading(false)
    })
  }, [skillNodeId])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleClaim = async (levelId: string) => {
    if (myLevelId === levelId) {
      await unclaimSkillLevel(skillNodeId)
      setMyLevelId(null)
    } else {
      await claimSkillLevel(skillNodeId, levelId)
      setMyLevelId(levelId)
    }
  }

  const startEdit = (level: SkillLevel) => {
    setEditingId(level.id)
    setEditDraft({ name: level.name, description: level.description ?? '', criteria: level.criteria })
  }

  const saveEdit = async () => {
    if (!editingId) return
    await updateSkillLevel(editingId, {
      name: editDraft.name,
      description: editDraft.description || null,
      criteria: editDraft.criteria,
    })
    setLevels(prev => prev.map(l => l.id === editingId ? { ...l, ...editDraft } as SkillLevel : l))
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this level? Users who claimed it will lose their level.')) return
    await deleteSkillLevel(id)
    setLevels(prev => prev.filter(l => l.id !== id))
    if (myLevelId === id) setMyLevelId(null)
  }

  const handleAddLevel = async () => {
    if (!newName.trim()) return
    const level = await createSkillLevel(skillNodeId, newName.trim(), levels.length + 1)
    setLevels(prev => [...prev, level])
    setNewName('')
    setAddingNew(false)
    setExpanded(prev => new Set([...prev, level.id]))
    startEdit(level)
  }

  const addCriterion = () => {
    setEditDraft(d => ({ ...d, criteria: [...(d.criteria ?? []), { text: '' }] }))
  }

  const updateCriterion = (i: number, text: string) => {
    setEditDraft(d => {
      const criteria = [...(d.criteria ?? [])]
      criteria[i] = { text }
      return { ...d, criteria }
    })
  }

  const removeCriterion = (i: number) => {
    setEditDraft(d => {
      const criteria = [...(d.criteria ?? [])]
      criteria.splice(i, 1)
      return { ...d, criteria }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
      </div>
    )
  }

  if (levels.length === 0 && !isEditing) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-400">No levels defined for this skill yet.</p>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-3 pb-32">
      <p className="text-sm text-gray-500 mb-2">
        Find the level that best describes where you are today and mark it — it saves to your profile.
      </p>

      {levels.map((level, idx) => {
        const isMine = myLevelId === level.id
        const isOpen = expanded.has(level.id)
        const isEditing = editingId === level.id

        return (
          <div
            key={level.id}
            className={`rounded-2xl border transition-colors ${
              isMine ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white'
            }`}
          >
            {/* Level header row */}
            <div className="flex items-center gap-3 px-5 py-4">
              {/* Level number badge */}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isMine ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {idx + 1}
              </span>

              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    autoFocus
                    value={editDraft.name ?? ''}
                    onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold outline-none focus:border-black"
                  />
                ) : (
                  <span className="font-semibold text-gray-900 text-sm">{level.name}</span>
                )}
                {!isEditing && level.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{level.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Claim button */}
                {!isEditing && (
                  <button
                    onClick={() => handleClaim(level.id)}
                    className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      isMine
                        ? 'bg-gray-900 text-white hover:bg-gray-700'
                        : 'border border-gray-200 text-gray-600 hover:border-gray-900 hover:text-gray-900'
                    }`}
                  >
                    {isMine ? (
                      <span className="flex items-center gap-1"><Check className="h-3 w-3" /> This is me</span>
                    ) : (
                      'This is me'
                    )}
                  </button>
                )}

                {/* Editor actions */}
                {isEditing && !isEditing && (
                  <>
                    <button
                      onClick={() => { startEdit(level); setExpanded(p => new Set([...p, level.id])) }}
                      className="cursor-pointer rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(level.id)}
                      className="cursor-pointer rounded-lg p-1 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}

                {isEditing && (
                  <>
                    <button onClick={saveEdit} className="cursor-pointer rounded-xl bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="cursor-pointer rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-black">
                      Cancel
                    </button>
                  </>
                )}

                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpand(level.id)}
                  className="cursor-pointer rounded-lg p-1 text-gray-400 hover:text-gray-700"
                >
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Expanded: description edit + criteria */}
            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4 flex flex-col gap-3">
                {isEditing && (
                  <input
                    value={editDraft.description ?? ''}
                    onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="Short description (optional)"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 outline-none focus:border-black"
                  />
                )}

                {/* Criteria list */}
                <div className="flex flex-col gap-2">
                  {(isEditing ? (editDraft.criteria ?? []) : level.criteria).map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gray-300 bg-white" />
                      {isEditing ? (
                        <>
                          <input
                            value={c.text}
                            onChange={e => updateCriterion(i, e.target.value)}
                            placeholder="Criterion…"
                            className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-black"
                          />
                          <button onClick={() => removeCriterion(i)} className="cursor-pointer text-gray-300 hover:text-red-500 mt-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-sm text-gray-600">{c.text}</span>
                      )}
                    </div>
                  ))}
                </div>

                {isEditing && (
                  <button
                    onClick={addCriterion}
                    className="cursor-pointer flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add criterion
                  </button>
                )}

                {!isEditing && level.criteria.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No criteria defined.</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Editor: add new level */}
      {isEditing && (
        <div className="mt-2">
          {addingNew ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 p-4">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLevel(); if (e.key === 'Escape') setAddingNew(false) }}
                placeholder="Level name (e.g. Beginner, 7a, Senior Marketer)"
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
              <button onClick={handleAddLevel} className="cursor-pointer rounded-xl bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800">
                Add
              </button>
              <button onClick={() => setAddingNew(false)} className="cursor-pointer rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingNew(true)}
              className="cursor-pointer flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 px-5 py-3 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 w-full"
            >
              <Plus className="h-4 w-4" /> Add level
            </button>
          )}
        </div>
      )}
    </div>
  )
}
