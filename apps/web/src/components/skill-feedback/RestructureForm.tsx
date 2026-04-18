import { useState, useEffect, useRef } from 'react'
import { Plus, X, Search, Trash2, GitBranch, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { SkillNode } from '@/pages/skills/types'
import type { RestructureProposal } from '@/types/restructure'
import { serializeProposal } from '@/lib/serializeProposal'

/* ── Types ─────────────────────────────────────────────────────────── */

interface SuggestedNode {
  uid: string
  name: string
  isLeaf: boolean
  children: SuggestedNode[]
}

interface BuilderNode {
  uid: string
  dbNode: SkillNode
  newName: string
  children: BuilderNode[]
  suggestions: SuggestedNode[]
  deleted?: boolean
}

/* ── Pure tree utils ─────────────────────────────────────────────── */

const mkNode = (db: SkillNode): BuilderNode =>
  ({ uid: crypto.randomUUID(), dbNode: db, newName: db.name, children: [], suggestions: [], deleted: false })

const mkSug = (isLeaf: boolean): SuggestedNode =>
  ({ uid: crypto.randomUUID(), name: '', isLeaf, children: [] })

const addChildToTree = (roots: BuilderNode[], parentUid: string, child: BuilderNode): BuilderNode[] =>
  roots.map(n => n.uid === parentUid
    ? { ...n, children: [...n.children, child] }
    : { ...n, children: addChildToTree(n.children, parentUid, child) })

const updateNameInTree = (roots: BuilderNode[], uid: string, name: string): BuilderNode[] =>
  roots.map(n => n.uid === uid
    ? { ...n, newName: name }
    : { ...n, children: updateNameInTree(n.children, uid, name) })

const removeFromTree = (roots: BuilderNode[], uid: string): BuilderNode[] =>
  roots.filter(n => n.uid !== uid).map(n => ({ ...n, children: removeFromTree(n.children, uid) }))

const toggleDeleteInTree = (roots: BuilderNode[], uid: string): BuilderNode[] =>
  roots.map(n => n.uid === uid
    ? { ...n, deleted: !n.deleted }
    : { ...n, children: toggleDeleteInTree(n.children, uid) })

const getAllDbIds = (roots: BuilderNode[]): Set<string> => {
  const s = new Set<string>()
  const walk = (arr: BuilderNode[]) => arr.forEach(n => { s.add(n.dbNode.id); walk(n.children) })
  walk(roots); return s
}

const addSugToNode = (roots: BuilderNode[], nodeUid: string, sug: SuggestedNode): BuilderNode[] =>
  roots.map(n => n.uid === nodeUid
    ? { ...n, suggestions: [...n.suggestions, sug] }
    : { ...n, children: addSugToNode(n.children, nodeUid, sug) })

// Adds sug to the parent of targetUid (for sibling insertion)
const addSugToParentOf = (roots: BuilderNode[], targetUid: string, sug: SuggestedNode): BuilderNode[] =>
  roots.map(n => {
    if (n.children.some(c => c.uid === targetUid)) {
      return { ...n, suggestions: [...n.suggestions, sug] }
    }
    return { ...n, children: addSugToParentOf(n.children, targetUid, sug) }
  })

const renameSug = (roots: BuilderNode[], sugUid: string, name: string): BuilderNode[] => {
  const inSugs = (ss: SuggestedNode[]): SuggestedNode[] =>
    ss.map(s => s.uid === sugUid ? { ...s, name } : { ...s, children: inSugs(s.children) })
  return roots.map(n => ({ ...n, suggestions: inSugs(n.suggestions), children: renameSug(n.children, sugUid, name) }))
}

const removeSug = (roots: BuilderNode[], sugUid: string): BuilderNode[] => {
  const fromSugs = (ss: SuggestedNode[]): SuggestedNode[] =>
    ss.filter(s => s.uid !== sugUid).map(s => ({ ...s, children: fromSugs(s.children) }))
  return roots.map(n => ({ ...n, suggestions: fromSugs(n.suggestions), children: removeSug(n.children, sugUid) }))
}

const addChildToSug = (roots: BuilderNode[], parentSugUid: string, child: SuggestedNode): BuilderNode[] => {
  const inSugs = (ss: SuggestedNode[]): SuggestedNode[] =>
    ss.map(s => s.uid === parentSugUid
      ? { ...s, children: [...s.children, child] }
      : { ...s, children: inSugs(s.children) })
  return roots.map(n => ({ ...n, suggestions: inSugs(n.suggestions), children: addChildToSug(n.children, parentSugUid, child) }))
}

/* ── Serialize ────────────────────────────────────────────────────── */

const serializeSugs = (sugs: SuggestedNode[]): object[] =>
  sugs.map(s => ({ name: s.name, isLeaf: s.isLeaf, children: serializeSugs(s.children) }))

const serialize = (roots: BuilderNode[]): object[] =>
  roots.map(n => ({
    id: n.dbNode.id,
    originalName: n.dbNode.name,
    ...(n.deleted
      ? { deleted: true }
      : {
          ...(n.newName !== n.dbNode.name && { suggestedName: n.newName }),
          children: serialize(n.children),
          ...(n.suggestions.length > 0 && { newNodes: serializeSugs(n.suggestions) }),
        }
    ),
  }))

/* ── NodeSearchPicker ───────────────────────────────────────────────── */

function NodeSearchPicker({ parentDbId, usedIds, onSelect, onClose, searchAll = false }: {
  parentDbId: string | null
  usedIds: Set<string>
  onSelect: (n: SkillNode) => void
  onClose: () => void
  searchAll?: boolean
}) {
  const [query, setQuery] = useState('')
  const [opts, setOpts] = useState<SkillNode[]>([])
  const [busy, setBusy] = useState(!searchAll)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    if (searchAll) return
    const q = parentDbId == null
      ? supabase.from('skill_nodes').select('*').is('parent_id', null).order('name')
      : supabase.from('skill_nodes').select('*').eq('parent_id', parentDbId).order('name')
    q.then(({ data }) => { setOpts(data ?? []); setBusy(false) })
  }, [parentDbId, searchAll])

  useEffect(() => {
    if (!searchAll) return
    if (query.length < 2) { setOpts([]); setBusy(false); return }
    setBusy(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.from('skill_nodes').select('*')
        .ilike('name', `%${query}%`).order('name').limit(20)
      setOpts(data ?? []); setBusy(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, searchAll])

  const visible = searchAll
    ? opts.filter(o => !usedIds.has(o.id))
    : opts.filter(o => !usedIds.has(o.id) && o.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input ref={ref} value={query} onChange={e => setQuery(e.target.value)}
          placeholder={searchAll ? 'Search all nodes…' : 'Search…'} className="flex-1 text-sm outline-none" />
        <button onClick={onClose}><X className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500" /></button>
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {searchAll && query.length < 2 && <p className="px-3 py-2 text-xs text-gray-400">Type to search…</p>}
        {busy && (!searchAll || query.length >= 2) && <p className="px-3 py-2 text-xs text-gray-400">{searchAll ? 'Searching…' : 'Loading…'}</p>}
        {!busy && visible.length === 0 && (!searchAll || query.length >= 2) && <p className="px-3 py-2 text-xs text-gray-400">No options</p>}
        {visible.map(n => (
          <button key={n.id} onClick={() => onSelect(n)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-indigo-50">
            {n.name}
            {n.is_leaf && <span className="ml-auto text-[10px] text-gray-400">leaf</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── TreeItem (left panel) ──────────────────────────────────────────── */

function TreeItem({ node, depth, usedIds, openFor, onOpenPicker, onAddChild, onRemove, onClose, isRoot }: {
  node: BuilderNode
  depth: number
  usedIds: Set<string>
  openFor: string | null
  onOpenPicker: (uid: string) => void
  onAddChild: (parentUid: string, db: SkillNode) => void
  onRemove: (uid: string) => void
  onClose: () => void
  isRoot?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 24}px` }}>
        {depth > 0 && <div className="h-px w-5 shrink-0 bg-gray-200" />}
        <div className={`flex flex-1 items-center justify-between rounded-xl border px-3 py-2 shadow-sm transition-colors ${
          node.deleted ? 'border-rose-200 bg-rose-50' : 'border-gray-200 bg-white'
        }`}>
          <span className={`text-sm font-medium transition-colors ${
            node.deleted ? 'line-through text-rose-300' : 'text-gray-900'
          }`}>
            {node.dbNode.name}
          </span>
          {!isRoot && !node.deleted && (
            <button onClick={() => onRemove(node.uid)}
              className="ml-2 text-gray-300 hover:text-gray-500 transition-colors"
              title="Remove from builder">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!node.deleted && (
        <>
          {node.children.map(c => (
            <TreeItem key={c.uid} node={c} depth={depth + 1}
              usedIds={usedIds} openFor={openFor}
              onOpenPicker={onOpenPicker} onAddChild={onAddChild}
              onRemove={onRemove} onClose={onClose} />
          ))}

          <div className="relative py-1" style={{ paddingLeft: `${(depth + 1) * 24 + (depth > 0 ? 20 : 0)}px` }}>
            {openFor === node.uid ? (
              <NodeSearchPicker parentDbId={node.dbNode.id} usedIds={usedIds}
                onSelect={db => onAddChild(node.uid, db)} onClose={onClose} />
            ) : (
              <button onClick={() => onOpenPicker(node.uid)}
                className="flex items-center gap-1 rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400 transition hover:border-indigo-400 hover:text-indigo-500">
                <Plus className="h-3 w-3" /> Add child
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ── SuggestedSubtree ─────────────────────────────────────────────── */

function SuggestedSubtree({ nodes, depth, onRename, onRemove, onAddChild }: {
  nodes: SuggestedNode[]
  depth: number
  onRename: (uid: string, name: string) => void
  onRemove: (uid: string) => void
  onAddChild: (parentUid: string, child: SuggestedNode) => void
}) {
  return (
    <>
      {nodes.map(s => (
        <div key={s.uid}>
          <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {depth > 0 && <div className="h-px w-3 shrink-0 bg-emerald-200" />}
            <div className="flex flex-1 items-center gap-2">
              <input value={s.name} onChange={e => onRename(s.uid, e.target.value)}
                placeholder={s.isLeaf ? 'New leaf name…' : 'New branch name…'}
                className="flex-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 placeholder-emerald-300 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
              <span className="shrink-0 text-[10px] font-medium text-emerald-500">{s.isLeaf ? 'leaf' : 'branch'}</span>
              <button onClick={() => onRemove(s.uid)} className="text-emerald-300 transition hover:text-red-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {!s.isLeaf && (
            <>
              <SuggestedSubtree nodes={s.children} depth={depth + 1}
                onRename={onRename} onRemove={onRemove} onAddChild={onAddChild} />
              <div className="flex gap-2 py-1" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                <button onClick={() => onAddChild(s.uid, mkSug(true))}
                  className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
                  <Plus className="h-3 w-3" /> leaf
                </button>
                <button onClick={() => onAddChild(s.uid, mkSug(false))}
                  className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
                  <Plus className="h-3 w-3" /> branch
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </>
  )
}

/* ── FormTree (right panel) ───────────────────────────────────────── */

function FormTree({ nodes, depth, onRename, onToggleDelete, onAddSug, onRenameSug, onRemoveSug, onAddSugChild }: {
  nodes: BuilderNode[]
  depth: number
  onRename: (uid: string, name: string) => void
  onToggleDelete: (uid: string) => void
  onAddSug: (nodeUid: string, sug: SuggestedNode) => void
  onRenameSug: (sugUid: string, name: string) => void
  onRemoveSug: (sugUid: string) => void
  onAddSugChild: (parentSugUid: string, child: SuggestedNode) => void
}) {
  return (
    <>
      {nodes.map(n => (
        <div key={n.uid}>
          {n.deleted ? (
            <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
              {depth > 0 && <div className="h-px w-3 shrink-0 bg-rose-200" />}
              <div className="flex flex-1 items-center gap-2">
                <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm line-through text-rose-300">
                  {n.dbNode.name}
                </div>
                <button onClick={() => onToggleDelete(n.uid)}
                  className="shrink-0 text-xs font-medium text-rose-400 hover:text-indigo-500 transition-colors px-1">
                  undo
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
                {depth > 0 && <div className="h-px w-3 shrink-0 bg-gray-200" />}
                <input value={n.newName} onChange={e => onRename(n.uid, e.target.value)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
                    n.newName !== n.dbNode.name
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800 focus:border-indigo-500 focus:ring-indigo-100'
                      : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-indigo-400 focus:ring-indigo-50'
                  }`} />
                <button onClick={() => onToggleDelete(n.uid)}
                  className="shrink-0 text-gray-300 hover:text-rose-400 transition-colors"
                  title="Propose deletion">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {depth === 0 && (
                <div className="flex flex-wrap gap-2 py-1" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                  <button onClick={() => onAddSug(n.uid, mkSug(true))}
                    className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
                    <Plus className="h-3 w-3" /> child leaf
                  </button>
                  <button onClick={() => onAddSug(n.uid, mkSug(false))}
                    className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
                    <Plus className="h-3 w-3" /> child branch
                  </button>
                </div>
              )}
              {n.children.length > 0 && (
                <FormTree nodes={n.children} depth={depth + 1} onRename={onRename}
                  onToggleDelete={onToggleDelete}
                  onAddSug={onAddSug}
                  onRenameSug={onRenameSug} onRemoveSug={onRemoveSug} onAddSugChild={onAddSugChild} />
              )}
              <SuggestedSubtree nodes={n.suggestions} depth={depth + 1}
                onRename={onRenameSug} onRemove={onRemoveSug} onAddChild={onAddSugChild} />
              {depth > 0 && (
                <div className="flex flex-wrap gap-2 py-1" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                  <button onClick={() => onAddSug(n.uid, mkSug(true))}
                    className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
                    <Plus className="h-3 w-3" /> child leaf
                  </button>
                  <button onClick={() => onAddSug(n.uid, mkSug(false))}
                    className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
                    <Plus className="h-3 w-3" /> child branch
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </>
  )
}

/* ── RestructureForm ─────────────────────────────────────────────── */

interface Props {
  submitting: boolean
  onSubmit: (opts: {
    proposal: RestructureProposal
    targetNodeId?: string
    targetNodeName?: string
    message?: string
  }) => void
}

export function RestructureForm({ submitting, onSubmit }: Props) {
  const [roots, setRoots] = useState<BuilderNode[]>([])
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [loadingBranch, setLoadingBranch] = useState(false)
  const [notes, setNotes] = useState('')
  const usedIds = getAllDbIds(roots)

  const loadBranch = async (parent: SkillNode) => {
    setBranchPickerOpen(false)
    setLoadingBranch(true)
    const { data } = await supabase
      .from('skill_nodes')
      .select('*')
      .eq('parent_id', parent.id)
      .order('name')
    setLoadingBranch(false)
    const parentNode = mkNode(parent)
    const children = (data ?? []).map(mkNode)
    setRoots([{ ...parentNode, children }])
  }

  const handleSubmit = () => {
    if (!roots.length) return
    const changes: RestructureProposal['changes'] = {}
    changes.notes = JSON.stringify(serialize(roots))
    const proposal = serializeProposal('move', changes)
    const targetNodeId = roots[0]?.dbNode.id
    const targetNodeName = roots[0]?.dbNode.name
    onSubmit({ proposal, targetNodeId, targetNodeName, message: notes || undefined })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Left: tree builder */}
        <div>
          <p className="mb-1 text-sm font-semibold text-gray-800">Build the structure</p>
          <p className="mb-3 text-xs text-gray-400">
            Pick a starting node manually, or use <strong className="text-gray-500">Load branch</strong> to
            auto-populate all children of a branch so you can rename, delete, or add siblings.
          </p>

          {roots.map(r => (
            <TreeItem key={r.uid} node={r} depth={0} usedIds={usedIds}
              openFor={openFor} onOpenPicker={setOpenFor}
              onAddChild={(uid, db) => { setRoots(t => addChildToTree(t, uid, mkNode(db))); setOpenFor(null) }}
              onRemove={uid => setRoots(t => removeFromTree(t, uid))}
              onClose={() => setOpenFor(null)}
              isRoot={roots.length === 1 && r.uid === roots[0].uid} />
          ))}

          <div className="mt-1 flex flex-wrap gap-2">
            {roots.length > 0 ? (
              <button onClick={() => setRoots([])}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-xs font-medium text-gray-400 transition hover:border-rose-300 hover:text-rose-400">
                <RotateCcw className="h-3.5 w-3.5" />
                Start again
              </button>
            ) : (
              <>
                <div className="relative">
                  {openFor === 'root' ? (
                    <NodeSearchPicker searchAll={true} parentDbId={null} usedIds={usedIds}
                      onSelect={db => { setRoots(r => [...r, mkNode(db)]); setOpenFor(null) }}
                      onClose={() => setOpenFor(null)} />
                  ) : (
                    <button onClick={() => setOpenFor('root')}
                      className="flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-4 py-2 text-xs font-medium text-indigo-400 transition hover:border-indigo-500 hover:text-indigo-600">
                      <Plus className="h-3.5 w-3.5" />
                      Pick a starting node
                    </button>
                  )}
                </div>

                <div className="relative">
                  {branchPickerOpen ? (
                    <NodeSearchPicker searchAll={true} parentDbId={null} usedIds={new Set()}
                      onSelect={loadBranch}
                      onClose={() => setBranchPickerOpen(false)} />
                  ) : (
                    <button onClick={() => setBranchPickerOpen(true)} disabled={loadingBranch}
                      className="flex items-center gap-1.5 rounded-xl border border-dashed border-violet-300 px-4 py-2 text-xs font-medium text-violet-400 transition hover:border-violet-500 hover:text-violet-600 disabled:opacity-50">
                      <GitBranch className="h-3.5 w-3.5" />
                      {loadingBranch ? 'Loading…' : 'Load branch children'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: suggest changes */}
        <div>
          <p className="mb-1 text-sm font-semibold text-gray-800">Suggest changes</p>
          <p className="mb-3 text-xs text-gray-400">
            Rename nodes by editing their name. Add children or siblings with the buttons.
            Use the trash icon to propose deletion — cascade-deletes all descendants on approval.
          </p>
          {roots.length === 0
            ? <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">Build the tree on the left first</p>
              </div>
            : <FormTree nodes={roots} depth={0}
                onRename={(uid, name) => setRoots(t => updateNameInTree(t, uid, name))}
                onToggleDelete={uid => setRoots(t => toggleDeleteInTree(t, uid))}
                onAddSug={(nodeUid, sug) => setRoots(t => addSugToNode(t, nodeUid, sug))}
                onRenameSug={(sugUid, name) => setRoots(t => renameSug(t, sugUid, name))}
                onRemoveSug={sugUid => setRoots(t => removeSug(t, sugUid))}
                onAddSugChild={(parentSugUid, child) => setRoots(t => addChildToSug(t, parentSugUid, child))} />
          }
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Why should this be restructured?"
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={submitting || roots.length === 0}
          className="rounded-xl bg-linear-to-br from-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit restructure'}
        </button>
      </div>
    </div>
  )
}
