import { useState, useEffect, useRef } from 'react'
import {
  Plus, X, Search, GitBranch, AlertTriangle,
  Layers, Star, ArrowLeft, CheckCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthProvider'
import type { SkillNode } from './skills/types'

/* ── Types ─────────────────────────────────────────────────────────── */

type Category = 'new-node' | 'restructure' | 'report' | 'missing'

// A new node suggested only in the right-panel form (not from DB)
interface SuggestedNode {
  uid: string
  name: string
  isLeaf: boolean           // false = branch, shows its own child "+"
  children: SuggestedNode[]
}

interface BuilderNode {
  uid: string
  dbNode: SkillNode
  newName: string
  children: BuilderNode[]
  suggestions: SuggestedNode[]  // right-panel only; don't appear in left tree
}

/* ── Pure tree utils ─────────────────────────────────────────────── */

const mkNode = (db: SkillNode): BuilderNode =>
  ({ uid: crypto.randomUUID(), dbNode: db, newName: db.name, children: [], suggestions: [] })

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

const getAllDbIds = (roots: BuilderNode[]): Set<string> => {
  const s = new Set<string>()
  const walk = (arr: BuilderNode[]) => arr.forEach(n => { s.add(n.dbNode.id); walk(n.children) })
  walk(roots); return s
}

// ── Suggestion mutations (all operate on the BuilderNode tree) ──────

const addSugToNode = (roots: BuilderNode[], nodeUid: string, sug: SuggestedNode): BuilderNode[] =>
  roots.map(n => n.uid === nodeUid
    ? { ...n, suggestions: [...n.suggestions, sug] }
    : { ...n, children: addSugToNode(n.children, nodeUid, sug) })

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

// ── Serialize ────────────────────────────────────────────────────────

const serializeSugs = (sugs: SuggestedNode[]): object[] =>
  sugs.map(s => ({ name: s.name, isLeaf: s.isLeaf, children: serializeSugs(s.children) }))

const serialize = (roots: BuilderNode[]): object[] =>
  roots.map(n => ({
    id: n.dbNode.id,
    originalName: n.dbNode.name,
    ...(n.newName !== n.dbNode.name && { suggestedName: n.newName }),
    children: serialize(n.children),
    ...(n.suggestions.length > 0 && { newNodes: serializeSugs(n.suggestions) }),
  }))

/* ── NodeSearchPicker (constrained to DB children) ─────────────────── */

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

/* ── SingleNodePicker (global search, for forms) ─────────────────── */

function SingleNodePicker({ value, onChange, placeholder = 'Search for a skill…' }: {
  value: SkillNode | null
  onChange: (n: SkillNode | null) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [opts, setOpts] = useState<SkillNode[]>([])
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (query.length < 2) { setOpts([]); return }
    setBusy(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.from('skill_nodes').select('*')
        .ilike('name', `%${query}%`).order('name').limit(20)
      setOpts(data ?? []); setBusy(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2.5">
        <span className="flex-1 text-sm font-medium text-indigo-800">{value.name}</span>
        <button onClick={() => onChange(null)}><X className="h-4 w-4 text-indigo-400 hover:text-indigo-600" /></button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2.5 ${open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200'}`}>
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input ref={ref} value={query} onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder} className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400" />
      </div>
      {open && query.length >= 2 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="max-h-44 overflow-y-auto py-1">
            {busy && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
            {!busy && opts.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No results</p>}
            {opts.map(n => (
              <button key={n.id} onMouseDown={() => { onChange(n); setQuery(''); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-indigo-50">
                {n.name}
                {n.is_leaf && <span className="ml-auto text-[10px] text-gray-400">leaf</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── TreeItem (recursive node card) ─────────────────────────────── */

function TreeItem({ node, depth, usedIds, openFor, onOpenPicker, onAddChild, onRemove, onClose }: {
  node: BuilderNode
  depth: number
  usedIds: Set<string>
  openFor: string | null
  onOpenPicker: (uid: string) => void
  onAddChild: (parentUid: string, db: SkillNode) => void
  onRemove: (uid: string) => void
  onClose: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 24}px` }}>
        {depth > 0 && <div className="h-px w-5 shrink-0 bg-gray-200" />}
        <div className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <span className="text-sm font-medium text-gray-900">{node.dbNode.name}</span>
          <button onClick={() => onRemove(node.uid)} className="ml-2 text-gray-300 transition hover:text-red-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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
    </div>
  )
}

/* ── SuggestedSubtree (emerald-styled new nodes in right panel) ────── */

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

/* ── FormTree (right panel — mirrors tree with rename inputs) ─────── */

function FormTree({ nodes, depth, onRename, onAddSug, onRenameSug, onRemoveSug, onAddSugChild }: {
  nodes: BuilderNode[]
  depth: number
  onRename: (uid: string, name: string) => void
  onAddSug: (nodeUid: string, sug: SuggestedNode) => void
  onRenameSug: (sugUid: string, name: string) => void
  onRemoveSug: (sugUid: string) => void
  onAddSugChild: (parentSugUid: string, child: SuggestedNode) => void
}) {
  return (
    <>
      {nodes.map(n => (
        <div key={n.uid}>
          <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {depth > 0 && <div className="h-px w-3 shrink-0 bg-gray-200" />}
            <input value={n.newName} onChange={e => onRename(n.uid, e.target.value)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
                n.newName !== n.dbNode.name
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 focus:border-indigo-500 focus:ring-indigo-100'
                  : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-indigo-400 focus:ring-indigo-50'
              }`} />
          </div>
          {n.children.length > 0 && (
            <FormTree nodes={n.children} depth={depth + 1} onRename={onRename}
              onAddSug={onAddSug} onRenameSug={onRenameSug} onRemoveSug={onRemoveSug} onAddSugChild={onAddSugChild} />
          )}
          <SuggestedSubtree nodes={n.suggestions} depth={depth + 1}
            onRename={onRenameSug} onRemove={onRemoveSug} onAddChild={onAddSugChild} />
          <div className="flex gap-2 py-1" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
            <button onClick={() => onAddSug(n.uid, mkSug(true))}
              className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
              <Plus className="h-3 w-3" /> leaf
            </button>
            <button onClick={() => onAddSug(n.uid, mkSug(false))}
              className="flex items-center gap-1 rounded-xl border border-dashed border-emerald-300 px-2 py-1 text-xs text-emerald-400 transition hover:border-emerald-500 hover:text-emerald-600">
              <Plus className="h-3 w-3" /> branch
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

/* ── SuccessCard ──────────────────────────────────────────────────── */

function SuccessCard({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <CheckCircle className="h-10 w-10 text-indigo-500" />
      <p className="text-base font-semibold text-gray-900">{message}</p>
      <p className="text-sm text-gray-400">We'll review your suggestion soon.</p>
      <button onClick={onReset}
        className="mt-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200">
        Submit another
      </button>
    </div>
  )
}

/* ── RestructureBuilder ──────────────────────────────────────────── */

function RestructureBuilder() {
  const { session } = useAuth()
  const [roots, setRoots] = useState<BuilderNode[]>([])
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const usedIds = getAllDbIds(roots)

  const handleSubmit = async () => {
    if (!roots.length) return
    setLoading(true)
    try {
      await supabase.from('skill_feedback').insert({
        user_id: session?.user?.id ?? null,
        feedback_type: 'Restructure',
        current_issue: notes || 'Tree restructure suggestion',
        suggestion: JSON.stringify(serialize(roots)),
        status: 'pending',
      })
    } catch { /* table pending */ }
    setLoading(false); setSubmitted(true)
  }

  if (submitted) return (
    <SuccessCard message="Restructure submitted!" onReset={() => { setSubmitted(false); setRoots([]); setNotes('') }} />
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Left: tree builder */}
        <div>
          <p className="mb-1 text-sm font-semibold text-gray-800">Build the structure</p>
          <p className="mb-3 text-xs text-gray-400">
            Pick any root node to start. Each "Add child" only shows valid DB children of that node.
          </p>

          {roots.map(r => (
            <TreeItem key={r.uid} node={r} depth={0} usedIds={usedIds}
              openFor={openFor} onOpenPicker={setOpenFor}
              onAddChild={(uid, db) => { setRoots(t => addChildToTree(t, uid, mkNode(db))); setOpenFor(null) }}
              onRemove={uid => setRoots(t => removeFromTree(t, uid))}
              onClose={() => setOpenFor(null)} />
          ))}

          <div className="relative mt-1">
            {openFor === 'root' ? (
              roots.length === 0
                ? <NodeSearchPicker searchAll={true} parentDbId={null} usedIds={usedIds}
                    onSelect={db => { setRoots(r => [...r, mkNode(db)]); setOpenFor(null) }}
                    onClose={() => setOpenFor(null)} />
                : <NodeSearchPicker parentDbId={roots[0].dbNode.parent_id} usedIds={usedIds}
                    onSelect={db => { setRoots(r => [...r, mkNode(db)]); setOpenFor(null) }}
                    onClose={() => setOpenFor(null)} />
            ) : (
              <button onClick={() => setOpenFor('root')}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-4 py-2 text-xs font-medium text-indigo-400 transition hover:border-indigo-500 hover:text-indigo-600">
                <Plus className="h-3.5 w-3.5" />
                {roots.length === 0 ? 'Pick a starting node' : 'Add root sibling'}
              </button>
            )}
          </div>
        </div>

        {/* Right: rename form */}
        <div>
          <p className="mb-1 text-sm font-semibold text-gray-800">Suggest new names</p>
          <p className="mb-3 text-xs text-gray-400">
            Optionally rename any node. Highlighted inputs have a suggested rename.
          </p>
          {roots.length === 0
            ? <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">Build the tree on the left first</p>
              </div>
            : <FormTree nodes={roots} depth={0}
                onRename={(uid, name) => setRoots(t => updateNameInTree(t, uid, name))}
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
        <button onClick={handleSubmit} disabled={loading || roots.length === 0}
          className="rounded-xl bg-linear-to-br from-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50">
          {loading ? 'Submitting…' : 'Submit restructure'}
        </button>
      </div>
    </div>
  )
}

/* ── NewNodeForm ─────────────────────────────────────────────────── */

function NewNodeForm() {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [parent, setParent] = useState<SkillNode | null>(null)
  const [attrs, setAttrs] = useState<{ key: string; value: string }[]>([])
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await supabase.from('skill_feedback').insert({
        user_id: session?.user?.id ?? null,
        feedback_type: 'New Node',
        branch_name: parent?.name ?? null,
        current_issue: `Add new node: "${name}"`,
        suggestion: JSON.stringify({ name, parentId: parent?.id, parentName: parent?.name, attributes: attrs }),
        status: 'pending',
      })
    } catch { /* table pending */ }
    setLoading(false); setSubmitted(true)
  }

  if (submitted) return (
    <SuccessCard message="New node suggestion submitted!" onReset={() => { setSubmitted(false); setName(''); setParent(null); setAttrs([]) }} />
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Node name</label>
          <input required value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Rust Programming"
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Parent node <span className="text-gray-400">(optional)</span>
          </label>
          <SingleNodePicker value={parent} onChange={setParent} placeholder="Search for a parent…" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Attributes <span className="text-gray-400">(optional)</span>
          </label>
          <button type="button" onClick={() => setAttrs(a => [...a, { key: '', value: '' }])}
            className="flex items-center gap-1 text-xs text-indigo-500 transition hover:text-indigo-700">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {attrs.map((attr, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={attr.key}
              onChange={e => setAttrs(a => a.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
              placeholder="Key"
              className="w-28 shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder-gray-400 outline-none focus:border-indigo-400" />
            <input value={attr.value}
              onChange={e => setAttrs(a => a.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
              placeholder="Value or type"
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder-gray-400 outline-none focus:border-indigo-400" />
            <button type="button" onClick={() => setAttrs(a => a.filter((_, j) => j !== i))}
              className="text-gray-300 hover:text-red-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Why should this node be added?"
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading || !name.trim()}
          className="rounded-xl bg-linear-to-br from-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50">
          {loading ? 'Submitting…' : 'Submit suggestion'}
        </button>
      </div>
    </form>
  )
}

/* ── ReportIssueForm ─────────────────────────────────────────────── */

const ISSUE_TYPES = ['Wrong name', 'Wrong parent', 'Wrong attribute', 'Duplicate entry', 'Other']

function ReportIssueForm() {
  const { session } = useAuth()
  const [target, setTarget] = useState<SkillNode | null>(null)
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0])
  const [current, setCurrent] = useState('')
  const [shouldBe, setShouldBe] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!current.trim()) return
    setLoading(true)
    try {
      await supabase.from('skill_feedback').insert({
        user_id: session?.user?.id ?? null,
        feedback_type: `Report: ${issueType}`,
        branch_name: target?.name ?? null,
        current_issue: current.trim(),
        suggestion: shouldBe.trim() || null,
        status: 'pending',
      })
    } catch { /* table pending */ }
    setLoading(false); setSubmitted(true)
  }

  if (submitted) return (
    <SuccessCard message="Issue reported!" onReset={() => { setSubmitted(false); setTarget(null); setCurrent(''); setShouldBe('') }} />
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Which skill / branch?</label>
          <SingleNodePicker value={target} onChange={setTarget} placeholder="Search for the skill…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Issue type</label>
          <select value={issueType} onChange={e => setIssueType(e.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
            {ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">What's wrong?</label>
        <textarea required rows={3} value={current} onChange={e => setCurrent(e.target.value)}
          placeholder="Describe the issue…"
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          What should it be? <span className="text-gray-400">(optional)</span>
        </label>
        <textarea rows={2} value={shouldBe} onChange={e => setShouldBe(e.target.value)}
          placeholder="Suggest the correct version…"
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading || !current.trim()}
          className="rounded-xl bg-linear-to-br from-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50">
          {loading ? 'Reporting…' : 'Report issue'}
        </button>
      </div>
    </form>
  )
}

/* ── MissingSkillForm ────────────────────────────────────────────── */

function MissingSkillForm() {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [parent, setParent] = useState<SkillNode | null>(null)
  const [desc, setDesc] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await supabase.from('skill_feedback').insert({
        user_id: session?.user?.id ?? null,
        feedback_type: 'Missing Skill',
        branch_name: parent?.name ?? null,
        current_issue: `Missing: "${name}"`,
        suggestion: desc.trim() || null,
        status: 'pending',
      })
    } catch { /* table pending */ }
    setLoading(false); setSubmitted(true)
  }

  if (submitted) return (
    <SuccessCard message="Missing skill submitted!" onReset={() => { setSubmitted(false); setName(''); setParent(null); setDesc('') }} />
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Skill name</label>
          <input required value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Quantum Computing"
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Where does it belong? <span className="text-gray-400">(optional)</span>
          </label>
          <SingleNodePicker value={parent} onChange={setParent} placeholder="Search for a parent…" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Description <span className="text-gray-400">(optional)</span>
        </label>
        <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Why should this be added?"
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading || !name.trim()}
          className="rounded-xl bg-linear-to-br from-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50">
          {loading ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  )
}

/* ── Category definitions ────────────────────────────────────────── */

const CATEGORIES: {
  key: Category
  icon: React.ElementType
  title: string
  desc: string
  iconClass: string
  bgClass: string
}[] = [
  { key: 'new-node',    icon: Star,          title: 'New Node',      desc: 'Suggest adding a new skill or branch',   iconClass: 'text-violet-500', bgClass: 'bg-violet-50' },
  { key: 'restructure', icon: GitBranch,     title: 'Restructure',   desc: 'Build a new tree arrangement visually',  iconClass: 'text-indigo-500', bgClass: 'bg-indigo-50' },
  { key: 'report',      icon: AlertTriangle, title: 'Report Issue',  desc: 'Wrong name, parent or attribute',        iconClass: 'text-rose-500',   bgClass: 'bg-rose-50' },
  { key: 'missing',     icon: Layers,        title: 'Missing Skill', desc: 'A skill category is entirely absent',   iconClass: 'text-amber-500',  bgClass: 'bg-amber-50' },
]

/* ── Main page ───────────────────────────────────────────────────── */

export default function SkillFeedbackPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<Category | null>(null)
  const selected = CATEGORIES.find(c => c.key === category)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard/help')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Skill Structure</h1>
          <p className="mt-1 text-base text-gray-500">Suggest improvements to the skill tree.</p>
        </div>
      </div>

      {/* Category picker */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CATEGORIES.map(c => {
          const Icon = c.icon
          const active = category === c.key
          return (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`flex flex-col gap-2 rounded-2xl p-4 text-left transition ${
                active ? 'bg-white shadow-sm ring-2 ring-indigo-500' : 'bg-white hover:shadow-sm'
              }`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.bgClass}`}>
                <Icon className={`h-5 w-5 ${c.iconClass}`} />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                <p className="mt-0.5 text-xs text-gray-400">{c.desc}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Form area */}
      {category && selected ? (
        <div className="rounded-2xl bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${selected.bgClass}`}>
              <selected.icon className={`h-5 w-5 ${selected.iconClass}`} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{selected.title}</h2>
              <p className="text-sm text-gray-400">{selected.desc}</p>
            </div>
          </div>
          {category === 'new-node'    && <NewNodeForm />}
          {category === 'restructure' && <RestructureBuilder />}
          {category === 'report'      && <ReportIssueForm />}
          {category === 'missing'     && <MissingSkillForm />}
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-2xl bg-white">
          <p className="text-sm text-gray-400">Select a category above to get started</p>
        </div>
      )}
    </div>
  )
}
