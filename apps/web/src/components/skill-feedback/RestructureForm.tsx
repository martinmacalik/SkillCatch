import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Plus, Minus, X, Search, RotateCcw, Trash2, Pencil, RotateCw, Maximize2 } from 'lucide-react'
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

/* ── Pure tree utils ───────────────────────────────────────────────── */

const mkNode = (db: SkillNode): BuilderNode =>
  ({ uid: crypto.randomUUID(), dbNode: db, newName: db.name, children: [], suggestions: [], deleted: false })

const mkSug = (name = '', isLeaf = false): SuggestedNode =>
  ({ uid: crypto.randomUUID(), name, isLeaf, children: [] })

const addChildToTree = (roots: BuilderNode[], parentUid: string, child: BuilderNode): BuilderNode[] =>
  roots.map(n => n.uid === parentUid
    ? { ...n, children: [...n.children, child] }
    : { ...n, children: addChildToTree(n.children, parentUid, child) })

const updateNameInTree = (roots: BuilderNode[], uid: string, name: string): BuilderNode[] =>
  roots.map(n => n.uid === uid
    ? { ...n, newName: name }
    : { ...n, children: updateNameInTree(n.children, uid, name) })

const toggleDeleteInTree = (roots: BuilderNode[], uid: string): BuilderNode[] =>
  roots.map(n => n.uid === uid
    ? { ...n, deleted: !n.deleted }
    : { ...n, children: toggleDeleteInTree(n.children, uid) })

const getAllDbIds = (roots: BuilderNode[]): Set<string> => {
  const s = new Set<string>()
  const walk = (arr: BuilderNode[]) => arr.forEach(n => { s.add(n.dbNode.id); walk(n.children) })
  walk(roots); return s
}

const addSugToBuilderNode = (roots: BuilderNode[], parentUid: string, sug: SuggestedNode): BuilderNode[] =>
  roots.map(n => n.uid === parentUid
    ? { ...n, suggestions: [...n.suggestions, sug] }
    : { ...n, children: addSugToBuilderNode(n.children, parentUid, sug) })

const renameSugInTree = (roots: BuilderNode[], sugUid: string, name: string): BuilderNode[] => {
  const inSugs = (ss: SuggestedNode[]): SuggestedNode[] =>
    ss.map(s => s.uid === sugUid
      ? { ...s, name }
      : { ...s, children: inSugs(s.children) })
  return roots.map(n => ({ ...n, suggestions: inSugs(n.suggestions), children: renameSugInTree(n.children, sugUid, name) }))
}

const removeSugFromTree = (roots: BuilderNode[], sugUid: string): BuilderNode[] => {
  const fromSugs = (ss: SuggestedNode[]): SuggestedNode[] =>
    ss.filter(s => s.uid !== sugUid).map(s => ({ ...s, children: fromSugs(s.children) }))
  return roots.map(n => ({ ...n, suggestions: fromSugs(n.suggestions), children: removeSugFromTree(n.children, sugUid) }))
}

const addChildToSugInTree = (roots: BuilderNode[], parentSugUid: string, child: SuggestedNode): BuilderNode[] => {
  const inSugs = (ss: SuggestedNode[]): SuggestedNode[] =>
    ss.map(s => s.uid === parentSugUid
      ? { ...s, children: [...s.children, child] }
      : { ...s, children: inSugs(s.children) })
  return roots.map(n => ({ ...n, suggestions: inSugs(n.suggestions), children: addChildToSugInTree(n.children, parentSugUid, child) }))
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

function NodeSearchPicker({ parentDbId, usedIds, onSelect, onClose, searchAll = false, branchesOnly = false }: {
  parentDbId: string | null
  usedIds: Set<string>
  onSelect: (n: SkillNode) => void
  onClose: () => void
  searchAll?: boolean
  branchesOnly?: boolean
}) {
  const [query, setQuery] = useState('')
  const [opts, setOpts] = useState<SkillNode[]>([])
  const [busy, setBusy] = useState(!searchAll)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    if (searchAll) return
    const base = parentDbId == null
      ? supabase.from('skill_nodes').select('*').is('parent_id', null)
      : supabase.from('skill_nodes').select('*').eq('parent_id', parentDbId)
    const filtered = branchesOnly ? base.eq('is_leaf', false) : base
    filtered.order('name').then(({ data }) => { setOpts(data ?? []); setBusy(false) })
  }, [parentDbId, searchAll, branchesOnly])

  useEffect(() => {
    if (!searchAll) return
    if (query.length < 2) { setOpts([]); setBusy(false); return }
    setBusy(true)
    const t = setTimeout(async () => {
      const base = supabase.from('skill_nodes').select('*').ilike('name', `%${query}%`)
      const filtered = branchesOnly ? base.eq('is_leaf', false) : base
      const { data } = await filtered.order('name').limit(20)
      setOpts(data ?? []); setBusy(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, searchAll, branchesOnly])

  const visible = searchAll
    ? opts.filter(o => !usedIds.has(o.id))
    : opts.filter(o => !usedIds.has(o.id) && o.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-xl border border-gray-200 bg-white shadow-xl">
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

/* ── BranchGrid (parent + children laid out via CSS Grid) ──────────── */

// Each child gets its own auto-sized column; the parent is placed in the
// middle column (odd N) or spans the two middle columns (even N). This
// guarantees the parent rect is horizontally aligned with the middle child,
// even when subtrees have different widths.
//
// Every vertical 1px line uses the same `absolute left:50%` positioning so
// that the parent stem and per-child stems land on the same integer-pixel
// column; mixing positioning methods (e.g. justify-self vs. left:50%) is what
// causes the half-pixel rendering inconsistencies between siblings at some
// DPRs/zoom levels.
//
// Rows:
//   1. parent rect           (gridColumn: middleCol)
//   2. parent stem (16px)    (gridColumn: middleCol, abs-positioned 1px line)
//   3. trunk + child stems   (one cell per column, abs-positioned 1px lines)
//   4. children rects        (one per column)
function BranchGrid({ parent, items, tone = 'gray' }: {
  parent: React.ReactNode
  items: { key: string; render: React.ReactNode }[]
  tone?: 'gray' | 'emerald'
}) {
  if (items.length === 0) return <>{parent}</>

  const N = items.length
  const lineColor = tone === 'emerald' ? 'bg-emerald-300' : 'bg-gray-300'
  // 1-indexed grid column lines. Examples:
  //   N=1: cols 1 / 2          (single column)
  //   N=2: cols 1 / 3          (spans both columns)
  //   N=3: cols 2 / 3          (column 2)
  //   N=4: cols 2 / 4          (spans columns 2-3)
  //   N=5: cols 3 / 4          (column 3)
  const parentColStart = Math.floor((N - 1) / 2) + 1
  const parentColEnd = Math.floor(N / 2) + 2

  return (
    <div
      className="grid items-start justify-items-center"
      style={{
        gridTemplateColumns: `repeat(${N}, max-content)`,
        gridTemplateRows: 'auto auto auto auto',
      }}
    >
      <div style={{ gridRow: 1, gridColumn: `${parentColStart} / ${parentColEnd}` }}>
        {parent}
      </div>
      <div
        style={{ gridRow: 2, gridColumn: `${parentColStart} / ${parentColEnd}` }}
        className="relative h-4 w-full"
      >
        <div className={`absolute left-1/2 top-0 h-full w-px ${lineColor}`} />
      </div>
      {items.map((_, i) => (
        <div
          key={`stem-${i}`}
          style={{ gridRow: 3, gridColumn: i + 1 }}
          className="relative h-4 w-full"
        >
          {N > 1 && (
            <div
              className={`absolute top-0 h-px ${lineColor} ${
                i === 0 ? 'left-1/2 right-0'
                  : i === N - 1 ? 'left-0 right-1/2'
                  : 'inset-x-0'
              }`}
            />
          )}
          <div className={`absolute left-1/2 top-0 h-full w-px ${lineColor}`} />
        </div>
      ))}
      {items.map((item, i) => (
        // px-3 widens each column by 24px so adjacent sibling rectangles have
        // visible breathing room. Cells stay flush (no grid gap), so the trunk
        // and stems on rows 2-3 still meet at column boundaries with no break.
        <div key={item.key} style={{ gridRow: 4, gridColumn: i + 1 }} className="px-3">
          {item.render}
        </div>
      ))}
    </div>
  )
}

/* ── Whiteboard ────────────────────────────────────────────────────── */

const MIN_SCALE = 0.25
const MAX_SCALE = 3
const INITIAL_TOP_OFFSET = 64

function Whiteboard({ children }: { children: React.ReactNode }) {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  // Suppress auto-recentering once the user has manually panned/zoomed.
  const userInteracted = useRef(false)

  // ── Initial centering + auto-recenter as content grows (until first interaction) ──
  useLayoutEffect(() => {
    const c = containerRef.current
    const s = stageRef.current
    if (!c || !s) return

    const recenter = () => {
      if (userInteracted.current) return
      setPan({
        x: (c.offsetWidth - s.offsetWidth) / 2,
        y: INITIAL_TOP_OFFSET,
      })
    }

    recenter()
    const observer = new ResizeObserver(recenter)
    observer.observe(s)
    return () => observer.disconnect()
  }, [])

  // ── Pan via mouse drag on the background ──
  const onMouseDown = (e: React.MouseEvent) => {
    const tgt = e.target as HTMLElement
    if (tgt.closest('[data-node]') || tgt.closest('button') || tgt.closest('input')) return
    drag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      if (!drag.current) return
      userInteracted.current = true
      setPan({
        x: drag.current.panX + (e.clientX - drag.current.startX),
        y: drag.current.panY + (e.clientY - drag.current.startY),
      })
    }
    const up = () => { setDragging(false); drag.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragging])

  // ── Wheel zoom (anchored to cursor) ──
  // Must use addEventListener with { passive: false } since React's onWheel is
  // passive by default and preventDefault() on a synthetic wheel silently fails.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      userInteracted.current = true
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      // Smooth exponential zoom — works for both wheel and trackpad pinch
      // (which sends wheel events with smaller deltaY values).
      const factor = Math.exp(-e.deltaY * 0.001)

      setScale(prev => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor))
        const r = next / prev
        // panX' = cursorX - (cursorX - panX) * (newScale / oldScale)
        // keeps the content point under the cursor pinned through the zoom.
        setPan(p => ({
          x: cx - (cx - p.x) * r,
          y: cy - (cy - p.y) * r,
        }))
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Button-driven zoom (anchored to viewport center) ──
  const zoomBy = (factor: number) => {
    const el = containerRef.current
    if (!el) return
    userInteracted.current = true
    const cx = el.offsetWidth / 2
    const cy = el.offsetHeight / 2
    setScale(prev => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor))
      const r = next / prev
      setPan(p => ({
        x: cx - (cx - p.x) * r,
        y: cy - (cy - p.y) * r,
      }))
      return next
    })
  }

  const fitView = () => {
    const c = containerRef.current
    const s = stageRef.current
    if (!c || !s) return
    setScale(1)
    setPan({
      x: (c.offsetWidth - s.offsetWidth) / 2,
      y: INITIAL_TOP_OFFSET,
    })
    userInteracted.current = false
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-125 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={onMouseDown}
    >
      <div
        ref={stageRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        <div className="flex flex-col items-center gap-6">{children}</div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-xl border border-gray-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <button
          onClick={() => zoomBy(1.2)}
          disabled={scale >= MAX_SCALE - 0.001}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-black disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.2)}
          disabled={scale <= MIN_SCALE + 0.001}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-black disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={fitView}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-black"
          title="Fit to view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ── Left side primitives ──────────────────────────────────────────── */

// Uniform card dimensions for every BuilderNode rectangle and dashed "+" slot.
// Green Suggested rectangles are intentionally sized differently (see SuggestedRect).
const CARD = 'h-24 w-44'

function LeftNodeRect({ name }: { name: string }) {
  return (
    <div data-node className={`${CARD} flex items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 text-center shadow-sm`}>
      <span className="line-clamp-3 text-sm font-medium leading-tight text-gray-900">{name}</span>
    </div>
  )
}

function PlusPlaceholder({ onClick, picker }: {
  onClick?: () => void
  picker?: React.ReactNode
}) {
  return (
    <div data-node className="relative">
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`${CARD} flex items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white text-gray-400 transition hover:border-indigo-400 hover:text-indigo-500 disabled:cursor-default disabled:hover:border-gray-300 disabled:hover:text-gray-400`}
      >
        <Plus className="h-5 w-5" />
      </button>
      {picker}
    </div>
  )
}

interface LeftBranchProps {
  node: BuilderNode
  openFor: string | null
  usedIds: Set<string>
  onOpenPicker: (uid: string) => void
  onPickChild: (parentUid: string, db: SkillNode) => void
  onClosePicker: () => void
}

function LeftBranch({ node, openFor, usedIds, onOpenPicker, onPickChild, onClosePicker }: LeftBranchProps) {
  // Items in this node's children row: real children + the trailing "+" slot.
  // Leaves are terminal in the DB — no rows can have them as parent_id — so
  // omit the "+" placeholder for them; clicking it would always return "No options".
  const items = [
    ...node.children.map(c => ({
      key: c.uid,
      render: (
        <LeftBranch
          key={c.uid}
          node={c}
          openFor={openFor}
          usedIds={usedIds}
          onOpenPicker={onOpenPicker}
          onPickChild={onPickChild}
          onClosePicker={onClosePicker}
        />
      ),
    })),
    ...(node.dbNode.is_leaf ? [] : [{
      key: '__placeholder__',
      render: (
        <PlusPlaceholder
          onClick={() => onOpenPicker(node.uid)}
          picker={openFor === node.uid ? (
            <NodeSearchPicker
              parentDbId={node.dbNode.id}
              usedIds={usedIds}
              onSelect={db => onPickChild(node.uid, db)}
              onClose={onClosePicker}
            />
          ) : null}
        />
      ),
    }]),
  ]

  return <BranchGrid parent={<LeftNodeRect name={node.dbNode.name} />} items={items} />
}

/* ── Right side primitives ─────────────────────────────────────────── */

// Editable rectangle for an existing BuilderNode (synced from the left).
// Color encodes state: blue if renamed, red if deleted, gray-default otherwise.
function RightNodeRect({ node, editing, onStartEdit, onSaveEdit, onToggleDelete }: {
  node: BuilderNode
  editing: boolean
  onStartEdit: () => void
  onSaveEdit: (name: string) => void
  onToggleDelete: () => void
}) {
  const isRenamed = !node.deleted && node.newName !== node.dbNode.name
  const isDeleted = node.deleted

  const tone = isDeleted
    ? 'border-rose-300 bg-rose-50 text-rose-400'
    : isRenamed
      ? 'border-blue-300 bg-blue-50 text-blue-800'
      : 'border-gray-300 bg-white text-gray-900'

  return (
    <div data-node className={`group relative ${CARD} rounded-2xl border px-4 shadow-sm transition-colors ${tone}`}>
      <div className="flex h-full items-center justify-center text-center">
        {editing ? (
          <RenameInput
            initial={node.newName}
            onSubmit={onSaveEdit}
            onCancel={() => onSaveEdit(node.newName)}
          />
        ) : (
          <span className={`line-clamp-3 text-sm font-medium leading-tight ${isDeleted ? 'line-through' : ''}`}>
            {node.newName}
          </span>
        )}
      </div>

      {/* Action icons. When deleted, only the bin (now meaning "undo") remains. */}
      <div className="absolute right-2 top-2 flex gap-1">
        {!isDeleted && !editing && (
          <button
            onClick={onStartEdit}
            className="rounded-md p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600"
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={onToggleDelete}
          className={`rounded-md p-1 transition ${
            isDeleted
              ? 'text-rose-500 hover:bg-rose-100'
              : 'text-gray-300 hover:bg-gray-100 hover:text-rose-500'
          }`}
          title={isDeleted ? 'Undo deletion' : 'Propose deletion'}
        >
          {isDeleted ? <RotateCw className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}

// Green rectangle for a SuggestedNode (proposed addition).
function SuggestedRect({ sug, editing, onStartEdit, onSaveEdit, onRemove }: {
  sug: SuggestedNode
  editing: boolean
  onStartEdit: () => void
  onSaveEdit: (name: string) => void
  onRemove: () => void
}) {
  return (
    <div data-node className="relative min-w-40 rounded-2xl border border-emerald-300 bg-emerald-50 px-6 py-5 text-center shadow-sm">
      {editing ? (
        <RenameInput
          initial={sug.name}
          onSubmit={onSaveEdit}
          onCancel={() => onSaveEdit(sug.name)}
        />
      ) : (
        <span className="text-sm font-medium text-emerald-800">
          {sug.name || <span className="text-emerald-300">Unnamed</span>}
        </span>
      )}
      <div className="absolute right-2 top-2 flex gap-1">
        {!editing && (
          <button
            onClick={onStartEdit}
            className="rounded-md p-1 text-emerald-400 transition hover:bg-emerald-100 hover:text-emerald-700"
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={onRemove}
          className="rounded-md p-1 text-emerald-400 transition hover:bg-emerald-100 hover:text-rose-500"
          title="Remove suggestion"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// Inline rename input — Enter saves, Esc/blur cancels.
function RenameInput({ initial, onSubmit, onCancel }: {
  initial: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initial)
  return (
    <input
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSubmit(val.trim() || initial)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
        if (e.key === 'Escape') onCancel()
      }}
      className="w-full rounded-md border border-gray-200 bg-white/90 px-2 py-1 text-center text-sm text-gray-900 outline-none focus:border-indigo-400"
    />
  )
}

// The smaller dashed "+" used on the right to suggest additions.
// Click it once → it becomes an inline name input. Enter creates the suggestion.
function SmallPlusPlaceholder({ active, onActivate, onSubmit, onCancel }: {
  active: boolean
  onActivate: () => void
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  if (active) {
    return (
      <div data-node className="min-w-32 rounded-xl border-2 border-dashed border-emerald-400 bg-white px-3 py-2 shadow-sm">
        <NewSuggestionInput onSubmit={onSubmit} onCancel={onCancel} />
      </div>
    )
  }
  return (
    <div data-node>
      <button
        onClick={onActivate}
        className="flex min-w-32 items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white px-3 py-3 text-emerald-300 transition hover:border-emerald-500 hover:text-emerald-500"
        title="Suggest a new node here"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

function NewSuggestionInput({ onSubmit, onCancel }: {
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState('')
  return (
    <input
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val.trim()) onSubmit(val.trim()); else onCancel() }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
        if (e.key === 'Escape') onCancel()
      }}
      placeholder="Name…"
      className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-center text-sm text-gray-900 outline-none focus:border-emerald-500"
    />
  )
}

// Recursive renderer for a SuggestedNode (and its children).
interface SuggestedBranchProps {
  sug: SuggestedNode
  editingUid: string | null
  addingForUid: string | null
  onStartEdit: (uid: string) => void
  onSaveEdit: (uid: string, name: string) => void
  onRemove: (sugUid: string) => void
  onActivateAdd: (parentUid: string) => void
  onSubmitAdd: (parentUid: string, name: string) => void
  onCancelAdd: () => void
}

function SuggestedBranch(props: SuggestedBranchProps) {
  const { sug, editingUid, addingForUid } = props
  const items = [
    ...sug.children.map(c => ({
      key: c.uid,
      render: <SuggestedBranch key={c.uid} {...props} sug={c} />,
    })),
    {
      key: '__add__',
      render: (
        <SmallPlusPlaceholder
          active={addingForUid === sug.uid}
          onActivate={() => props.onActivateAdd(sug.uid)}
          onSubmit={name => props.onSubmitAdd(sug.uid, name)}
          onCancel={props.onCancelAdd}
        />
      ),
    },
  ]

  return (
    <BranchGrid
      tone="emerald"
      parent={
        <SuggestedRect
          sug={sug}
          editing={editingUid === sug.uid}
          onStartEdit={() => props.onStartEdit(sug.uid)}
          onSaveEdit={name => props.onSaveEdit(sug.uid, name)}
          onRemove={() => props.onRemove(sug.uid)}
        />
      }
      items={items}
    />
  )
}

// Recursive renderer for the right-side BuilderNode tree.
interface RightBranchProps {
  node: BuilderNode
  editingUid: string | null
  addingForUid: string | null
  onStartEdit: (uid: string) => void
  onSaveBuilderEdit: (uid: string, name: string) => void
  onSaveSugEdit: (uid: string, name: string) => void
  onToggleDelete: (uid: string) => void
  onRemoveSug: (sugUid: string) => void
  onActivateAdd: (parentUid: string) => void
  onSubmitAdd: (parentUid: string, name: string) => void
  onCancelAdd: () => void
}

function RightBranch(props: RightBranchProps) {
  const { node, editingUid, addingForUid } = props

  if (node.deleted) {
    // Deleted nodes hide their children/suggestions/+ — they're cascading on approval.
    return (
      <RightNodeRect
        node={node}
        editing={false}
        onStartEdit={() => {}}
        onSaveEdit={() => {}}
        onToggleDelete={() => props.onToggleDelete(node.uid)}
      />
    )
  }

  const items = [
    ...node.children.map(c => ({
      key: c.uid,
      render: <RightBranch key={c.uid} {...props} node={c} />,
    })),
    ...node.suggestions.map(s => ({
      key: s.uid,
      render: (
        <SuggestedBranch
          key={s.uid}
          sug={s}
          editingUid={editingUid}
          addingForUid={addingForUid}
          onStartEdit={props.onStartEdit}
          onSaveEdit={props.onSaveSugEdit}
          onRemove={props.onRemoveSug}
          onActivateAdd={props.onActivateAdd}
          onSubmitAdd={props.onSubmitAdd}
          onCancelAdd={props.onCancelAdd}
        />
      ),
    })),
    {
      key: '__add__',
      render: (
        <SmallPlusPlaceholder
          active={addingForUid === node.uid}
          onActivate={() => props.onActivateAdd(node.uid)}
          onSubmit={name => props.onSubmitAdd(node.uid, name)}
          onCancel={props.onCancelAdd}
        />
      ),
    },
  ]

  return (
    <BranchGrid
      parent={
        <RightNodeRect
          node={node}
          editing={editingUid === node.uid}
          onStartEdit={() => props.onStartEdit(node.uid)}
          onSaveEdit={name => props.onSaveBuilderEdit(node.uid, name)}
          onToggleDelete={() => props.onToggleDelete(node.uid)}
        />
      }
      items={items}
    />
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
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [addingForUid, setAddingForUid] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const usedIds = getAllDbIds(roots)
  const root = roots[0] ?? null

  const handleSubmit = () => {
    if (!roots.length) return
    const changes: RestructureProposal['changes'] = {}
    changes.notes = JSON.stringify(serialize(roots))
    const proposal = serializeProposal('move', changes)
    const targetNodeId = roots[0]?.dbNode.id
    const targetNodeName = roots[0]?.dbNode.name
    onSubmit({ proposal, targetNodeId, targetNodeName, message: notes || undefined })
  }

  // ── Right-side handlers ──
  const onSaveBuilderEdit = (uid: string, name: string) => {
    setRoots(t => updateNameInTree(t, uid, name))
    setEditingUid(null)
  }
  const onSaveSugEdit = (uid: string, name: string) => {
    setRoots(t => renameSugInTree(t, uid, name))
    setEditingUid(null)
  }
  const onToggleDelete = (uid: string) => {
    setRoots(t => toggleDeleteInTree(t, uid))
  }
  const onRemoveSug = (sugUid: string) => {
    setRoots(t => removeSugFromTree(t, sugUid))
  }
  // Adds a new SuggestedNode under a parent. The parent may be either a
  // BuilderNode (use its .suggestions[]) or a SuggestedNode (use its .children[]).
  // Both helpers are no-ops when the uid doesn't match, so calling them in
  // sequence covers both cases without an explicit kind discriminator.
  const onSubmitAdd = (parentUid: string, name: string) => {
    const newSug = mkSug(name, false)
    setRoots(t => addChildToSugInTree(addSugToBuilderNode(t, parentUid, newSug), parentUid, newSug))
    setAddingForUid(null)
  }

  const renderLeft = () => {
    if (!root) {
      return (
        <PlusPlaceholder
          onClick={() => setOpenFor('root')}
          picker={openFor === 'root' ? (
            <NodeSearchPicker
              searchAll
              branchesOnly
              parentDbId={null}
              usedIds={usedIds}
              onSelect={db => { setRoots([mkNode(db)]); setOpenFor(null) }}
              onClose={() => setOpenFor(null)}
            />
          ) : null}
        />
      )
    }
    return (
      <LeftBranch
        node={root}
        openFor={openFor}
        usedIds={usedIds}
        onOpenPicker={setOpenFor}
        onPickChild={(parentUid, db) => {
          setRoots(t => addChildToTree(t, parentUid, mkNode(db)))
          setOpenFor(null)
        }}
        onClosePicker={() => setOpenFor(null)}
      />
    )
  }

  const renderRight = () => {
    if (!root) {
      // No big "+" on the right — the right is read-only until the left builds something.
      return (
        <p className="text-sm text-gray-400">
          Pick a starting node on the left to begin.
        </p>
      )
    }
    return (
      <RightBranch
        node={root}
        editingUid={editingUid}
        addingForUid={addingForUid}
        onStartEdit={setEditingUid}
        onSaveBuilderEdit={onSaveBuilderEdit}
        onSaveSugEdit={onSaveSugEdit}
        onToggleDelete={onToggleDelete}
        onRemoveSug={onRemoveSug}
        onActivateAdd={setAddingForUid}
        onSubmitAdd={onSubmitAdd}
        onCancelAdd={() => setAddingForUid(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left whiteboard — builder, picks real DB nodes */}
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-800">Current structure</p>
          <Whiteboard>{renderLeft()}</Whiteboard>
          {root && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => { setRoots([]); setEditingUid(null); setAddingForUid(null) }}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-xs font-medium text-gray-400 transition hover:border-rose-300 hover:text-rose-400">
                <RotateCcw className="h-3.5 w-3.5" />
                Start again
              </button>
            </div>
          )}
        </div>

        {/* Right whiteboard — proposal: rename, delete, suggest additions */}
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-800">Proposed changes</p>
          <Whiteboard>{renderRight()}</Whiteboard>
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
