import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  CornerDownLeft,
  GraduationCap,
  MessageSquare,
  Plus,
  Puzzle,
  Search,
  Timer,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/cn'
import { useAuth } from '@/contexts/AuthProvider'
import { useSearch } from '@/contexts/SearchContext'
import { supabase } from '@/lib/supabaseClient'
import { emitAppEvent } from '@/lib/app-events'
import { conversationName, fetchConversations, type ConversationSummary } from '@/lib/chat-queries'
import { timerStart } from '@/lib/timer-queries'
import { matchRange, matchScore } from '@/lib/search/match'
import { STATIC_ENTRIES, type StaticCategory, type StaticEntry } from '@/lib/search/search-index'
import { globalSearch, type ServerCategory, type ServerResults } from '@/lib/search/search-queries'

/*
 * One search for the whole app (TopBar, ⌘K / Ctrl+K), VS Code style.
 * Results come in sections; big ones (new skills, people, teachers) show only a
 * couple of rows plus "All … · N ›", which narrows the search to that category
 * (a chip in the field, removed with Backspace / ×). Prefixes do the same:
 * ">" actions, "@" people, "#" skills.
 */

type Category = ServerCategory | 'chats' | StaticCategory

const CATEGORY: Record<Category, { label: string; all: string; preview: number; icon: LucideIcon }> = {
  my_skills: { label: 'My skills', all: 'All my skills', preview: 4, icon: Puzzle },
  chats: { label: 'Chats', all: 'All chats', preview: 4, icon: MessageSquare },
  actions: { label: 'Actions', all: 'All actions', preview: 4, icon: Plus },
  pages: { label: 'Pages', all: 'All pages', preview: 4, icon: ChevronRight },
  settings: { label: 'Settings', all: 'All settings', preview: 3, icon: ChevronRight },
  new_skills: { label: 'New skills', all: 'All new skills', preview: 2, icon: Puzzle },
  people: { label: 'People', all: 'All people', preview: 2, icon: Users },
  teachers: { label: 'Teachers', all: 'All teachers', preview: 2, icon: GraduationCap },
  help: { label: 'Help & rewards', all: 'All help topics', preview: 3, icon: ChevronRight },
}

const DEFAULT_ORDER: Category[] = ['my_skills', 'chats', 'actions', 'pages', 'settings', 'new_skills', 'people', 'teachers', 'help']
const PREFIXES: Record<string, Category> = { '>': 'actions', '@': 'people', '#': 'my_skills' }
const SERVER_CATEGORIES: ServerCategory[] = ['my_skills', 'new_skills', 'people', 'teachers']

const STATUS_LABEL = { watchlist: 'Watchlist', learning: 'Learning', learned: 'Learned', dormant: 'Dormant' } as const
const LEVEL_LABEL = { intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' } as const

/** The category the current page is about goes first. */
function pageCategory(path: string): Category | null {
  if (path.startsWith('/dashboard/skills')) return 'my_skills'
  if (path.startsWith('/dashboard/chats')) return 'chats'
  if (path.startsWith('/dashboard/discover')) return 'people'
  if (path.startsWith('/dashboard/teach')) return 'teachers'
  if (path.startsWith('/dashboard/settings')) return 'settings'
  if (path.startsWith('/dashboard/help') || path.startsWith('/dashboard/rewards')) return 'help'
  return null
}

interface Row {
  key: string
  category: Category
  title: string
  subtitle?: string
  icon?: LucideIcon
  image?: string | null
  round?: boolean
  run: () => void | Promise<void>
}

interface Section {
  category: Category
  rows: Row[]
  total: number
}

type Item = { kind: 'row'; row: Row } | { kind: 'more'; category: Category; total: number }

interface GlobalSearchProps {
  /** 'bar' = field in the TopBar with a dropdown; 'overlay' = full screen (mobile). */
  variant?: 'bar' | 'overlay'
  /** Overlay: close it. */
  onClose?: () => void
  /** Bar: ⌘K while the bar is hidden (small screens) → open the overlay instead. */
  onRequestOverlay?: () => void
  className?: string
}

export function GlobalSearch({ variant = 'bar', onClose, onRequestOverlay, className }: GlobalSearchProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const userId = session?.user.id
  const { query, setQuery, pageScope } = useSearch()

  const overlay = variant === 'overlay'
  const [open, setOpen] = useState(overlay)
  const [scope, setScope] = useState<Category | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [server, setServer] = useState<{ key: string; data: ServerResults } | null>(null)
  const [chats, setChats] = useState<ConversationSummary[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const q = query.trim()
  const serverScope = scope && (SERVER_CATEGORIES as Category[]).includes(scope) ? (scope as ServerCategory) : null
  const serverKey = `${q}|${scope ?? ''}`
  const loading = !!q && open && server?.key !== serverKey && (!scope || !!serverScope)
  // compact "Also found" when the page already lists that category filtered
  const compact = variant === 'bar' && !!pageScope && !scope

  /* ── data ── */

  // database categories, debounced
  useEffect(() => {
    if (!open || !q || (scope && !serverScope)) return
    let cancelled = false
    const t = setTimeout(() => {
      globalSearch(q, serverScope ? 30 : 4, serverScope)
        .then((data) => !cancelled && setServer({ key: serverKey, data }))
        .catch(() => !cancelled && setServer({ key: serverKey, data: {} }))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, q, scope, serverScope, serverKey])

  // chats: one fetch each time the panel opens
  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    fetchConversations(userId)
      .then((l) => !cancelled && setChats([...l.requests, ...l.conversations]))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, userId])

  /* ── sections ── */

  const sections = useMemo<Section[]>(() => {
    if (!q) return []
    const data = server?.data ?? {}
    const out: Partial<Record<Category, Section>> = {}

    // my skills
    if (data.my_skills) {
      out.my_skills = {
        category: 'my_skills',
        total: data.my_skills.count,
        rows: data.my_skills.items.map((s) => ({
          key: `ms-${s.id}`,
          category: 'my_skills',
          title: s.name,
          subtitle: [STATUS_LABEL[s.status], s.pinned && 'Pinned'].filter(Boolean).join(' · '),
          image: s.image_url,
          icon: Puzzle,
          run: () => navigate(`/dashboard/learn/${s.id}`),
        })),
      }
    }
    if (data.new_skills) {
      out.new_skills = {
        category: 'new_skills',
        total: data.new_skills.count,
        rows: data.new_skills.items.map((s) => ({
          key: `ns-${s.id}`,
          category: 'new_skills',
          title: s.name,
          subtitle: s.parent_name ? `in ${s.parent_name} · Add to your skills` : 'Add to your skills',
          image: s.image_url,
          icon: Plus,
          run: () => navigate('/dashboard/skills', { state: { addQuery: s.name } }),
        })),
      }
    }
    if (data.people) {
      out.people = {
        category: 'people',
        total: data.people.count,
        rows: data.people.items.map((p) => ({
          key: `pp-${p.id}`,
          category: 'people',
          title: p.name,
          subtitle: p.username ? `@${p.username}` : undefined,
          image: p.avatar_url,
          round: true,
          icon: User,
          run: () => navigate(`/profile/${p.id}`),
        })),
      }
    }
    if (data.teachers) {
      out.teachers = {
        category: 'teachers',
        total: data.teachers.count,
        rows: data.teachers.items.map((t) => ({
          key: `tc-${t.user_id}-${t.skill_id}`,
          category: 'teachers',
          title: t.name,
          subtitle: `Teaches ${t.skill_name} · ${LEVEL_LABEL[t.level]}`,
          image: t.avatar_url,
          round: true,
          icon: GraduationCap,
          run: () => navigate(`/profile/${t.user_id}`),
        })),
      }
    }

    // chats (client side)
    const chatHits = chats
      .map((c) => ({ c, score: matchScore(q, conversationName(c)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    if (chatHits.length) {
      out.chats = {
        category: 'chats',
        total: chatHits.length,
        rows: chatHits.slice(0, scope === 'chats' ? 30 : CATEGORY.chats.preview).map(({ c }) => ({
          key: `ch-${c.id}`,
          category: 'chats',
          title: conversationName(c),
          subtitle: c.type === 'group' ? 'Group chat' : c.unread ? 'Unread' : 'Chat',
          icon: MessageSquare,
          run: () => navigate(`/dashboard/chats/${c.id}`),
        })),
      }
    }

    // actions, pages, settings, help (client side) + actions built from the query
    type Hit = StaticEntry & { score: number; runFn?: () => Promise<void> }
    const dynamic: Hit[] = []
    const topSkill = data.my_skills?.items[0]
    if (topSkill) {
      dynamic.push({
        id: `a-track-${topSkill.id}`,
        category: 'actions',
        title: `Track time on ${topSkill.name}`,
        subtitle: 'Starts the Time Tracker',
        icon: Timer,
        run: { kind: 'go', to: '/dashboard' },
        score: 70,
        runFn: async () => {
          try {
            await timerStart(topSkill.id)
            emitAppEvent('timer:started')
          } catch {
            /* a session is already running: the dashboard shows it */
          }
          navigate('/dashboard')
        },
      })
    }
    dynamic.push({
      id: 'a-create-skill',
      category: 'actions',
      title: `Create skill “${q}”`,
      subtitle: 'Suggest a skill that doesn’t exist yet',
      icon: Plus,
      run: { kind: 'go', to: '/dashboard/skills', state: { createSkill: true, createName: q } },
      score: 25,
    })

    const staticHits: Hit[] = [
      ...dynamic,
      ...STATIC_ENTRIES.map((e) => ({ ...e, score: matchScore(q, e.title, `${e.subtitle ?? ''} ${e.keywords ?? ''}`) })),
    ]
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)

    for (const cat of ['actions', 'pages', 'settings', 'help'] as const) {
      const hits = staticHits.filter((e) => e.category === cat)
      if (!hits.length) continue
      out[cat] = {
        category: cat,
        total: hits.length,
        rows: hits.slice(0, scope === cat ? 50 : CATEGORY[cat].preview).map((e) => ({
          key: e.id,
          category: cat,
          title: e.title,
          subtitle: e.subtitle,
          icon: e.icon,
          run: () => {
            if (e.runFn) return e.runFn()
            if (e.run.kind === 'logout') {
              return supabase.auth.signOut().then(() => navigate('/'))
            }
            navigate(e.run.to, e.run.state ? { state: e.run.state } : undefined)
          },
        })),
      }
    }

    const first = pageCategory(location.pathname)
    const order = first ? [first, ...DEFAULT_ORDER.filter((c) => c !== first)] : DEFAULT_ORDER
    return order
      .filter((c) => !scope || c === scope)
      .map((c) => out[c])
      .filter((s): s is Section => !!s && s.rows.length > 0)
      .map((s) => (scope ? s : { ...s, rows: s.rows.slice(0, CATEGORY[s.category].preview) }))
  }, [q, server, chats, scope, location.pathname, navigate])

  // flat list for the keyboard: rows + "All … ›"
  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    for (const s of sections) {
      for (const row of s.rows) list.push({ kind: 'row', row })
      if (!scope && s.total > s.rows.length) list.push({ kind: 'more', category: s.category, total: s.total })
    }
    return list
  }, [sections, scope])

  // compact mode: only the other categories, as chips
  const alsoFound = compact ? sections.filter((s) => s.category !== pageScope) : []

  const active = items.length ? Math.min(activeIndex, items.length - 1) : -1

  /* ── actions ── */

  const close = () => {
    setOpen(false)
    setScope(null)
    inputRef.current?.blur()
    onClose?.()
  }

  const enterScope = (c: Category) => {
    setScope(c)
    setActiveIndex(0)
    setOpen(true)
    inputRef.current?.focus()
  }

  const runRow = async (row: Row) => {
    setQuery('')
    close()
    await row.run()
  }

  const pick = (item: Item) => (item.kind === 'row' ? void runRow(item.row) : enterScope(item.category))

  // ⌘K / Ctrl+K anywhere
  useEffect(() => {
    if (overlay) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (inputRef.current && inputRef.current.offsetParent === null) onRequestOverlay?.()
        else inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, onRequestOverlay])

  // click outside closes the dropdown
  useEffect(() => {
    if (!open || overlay) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setScope(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, overlay])

  // keep the highlighted row visible
  useEffect(() => {
    if (active >= 0) document.getElementById(`gs-item-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onChange = (value: string) => {
    // ">", "@", "#" at the start narrow the search like the "All … ›" rows
    if (!scope && value.length >= 1 && PREFIXES[value[0]]) {
      setScope(PREFIXES[value[0]])
      value = value.slice(1)
    }
    setQuery(value)
    setActiveIndex(0)
    setOpen(true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!items.length) return
      const d = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((active + d + items.length) % items.length)
    } else if (e.key === 'Enter') {
      if (compact) return // the page list is the result
      const item = items[active]
      if (item) {
        e.preventDefault()
        pick(item)
      }
    } else if (e.key === 'Tab' && !scope && items[active]) {
      // Tab = narrow to the highlighted row's category
      e.preventDefault()
      const item = items[active]
      enterScope(item.kind === 'row' ? item.row.category : item.category)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (scope) setScope(null)
      else close()
    } else if (e.key === 'Backspace' && !query && scope) {
      setScope(null)
    }
  }

  /* ── render ── */

  const field = (
    <div className={cn('relative flex items-center', overlay ? 'flex-1' : 'w-full')}>
      <Search className="pointer-events-none absolute left-4 h-4 w-4 text-gray-400" />
      <div className="flex w-full items-center gap-2 rounded-4xl bg-white py-2 pr-3 pl-11 focus-within:ring-2 focus-within:ring-black/10">
        {scope && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-purple-100 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-purple-700">
            {CATEGORY[scope].label}
            <button
              type="button"
              onClick={() => {
                setScope(null)
                inputRef.current?.focus()
              }}
              aria-label={`Search everything, not only ${CATEGORY[scope].label}`}
              className="rounded-full p-0.5 hover:bg-purple-200"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={overlay}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={scope ? `Search ${CATEGORY[scope].label.toLowerCase()}…` : 'Search skills, people, settings…'}
          aria-label="Search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-activedescendant={active >= 0 ? `gs-item-${active}` : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        {!overlay && !query && !scope && (
          <kbd className="hidden shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 lg:block">
            {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
      </div>
    </div>
  )

  const showPanel = open && (overlay || !!q || !!scope)
  const panelBody = compact ? (
    <AlsoFound sections={alsoFound} loading={loading} onPick={enterScope} />
  ) : (
    <ResultsList
      query={q}
      scope={scope}
      sections={sections}
      items={items}
      active={active}
      loading={loading}
      onHover={setActiveIndex}
      onPick={pick}
    />
  )

  if (overlay) {
    return (
      <div ref={boxRef} className={cn('fixed inset-0 z-50 flex flex-col bg-gray-100', className)}>
        <div className="flex items-center gap-2 p-3">
          <button type="button" onClick={close} aria-label="Close search" className="rounded-full p-2 text-gray-600 hover:bg-gray-200">
            <ArrowLeft className="h-5 w-5" />
          </button>
          {field}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">{panelBody}</div>
      </div>
    )
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      {field}
      {showPanel && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-gray-200">
          {panelBody}
        </div>
      )}
    </div>
  )
}

/* ── panel parts ── */

function ResultsList({
  query,
  scope,
  sections,
  items,
  active,
  loading,
  onHover,
  onPick,
}: {
  query: string
  scope: Category | null
  sections: Section[]
  items: Item[]
  active: number
  loading: boolean
  onHover: (i: number) => void
  onPick: (item: Item) => void
}) {
  if (!query) {
    return (
      <div className="px-3 py-4 text-sm text-gray-500">
        <p className="font-medium text-gray-700">Search skills, chats, people, settings and more.</p>
        <p className="mt-2 text-xs text-gray-400">
          Narrow it down: <Kbd>{'>'}</Kbd> actions · <Kbd>@</Kbd> people · <Kbd>#</Kbd> my skills · <Kbd>Tab</Kbd> only this category
        </p>
      </div>
    )
  }
  if (!sections.length) {
    return <p className="px-3 py-4 text-sm text-gray-400">{loading ? 'Searching…' : `Nothing found for “${query}”${scope ? ` in ${CATEGORY[scope].label}` : ''}.`}</p>
  }

  const layout = indexSections(sections, scope)
  return (
    <div id="global-search-results" role="listbox" className="flex flex-col gap-1">
      {layout.map(({ section: s, rowIndexes, moreIndex }) => (
        <div key={s.category}>
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
            {CATEGORY[s.category].label}
            {scope && <span className="ml-1.5 font-normal normal-case">· {s.total}</span>}
          </p>
          {s.rows.map((row, r) => {
            const idx = rowIndexes[r]
            return (
              <ResultRow key={row.key} id={`gs-item-${idx}`} row={row} query={query} active={idx === active} onHover={() => onHover(idx)} onPick={() => onPick({ kind: 'row', row })} />
            )
          })}
          {moreIndex !== null && (
            <button
              type="button"
              id={`gs-item-${moreIndex}`}
              role="option"
              aria-selected={moreIndex === active}
              onMouseMove={() => moreIndex !== active && onHover(moreIndex)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => items[moreIndex] && onPick(items[moreIndex])}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-purple-700',
                moreIndex === active && 'bg-purple-50',
              )}
            >
              {CATEGORY[s.category].all} · {s.total}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {loading && <p className="px-3 pb-1 text-[11px] text-gray-400">Searching…</p>}
    </div>
  )
}

/** Keyboard index of every row and "All … ›" line, in the same order as `items`. */
function indexSections(sections: Section[], scope: Category | null) {
  let next = 0
  return sections.map((section) => {
    const rowIndexes = section.rows.map(() => next++)
    const moreIndex = !scope && section.total > section.rows.length ? next++ : null
    return { section, rowIndexes, moreIndex }
  })
}

function ResultRow({
  id,
  row,
  query,
  active,
  onHover,
  onPick,
}: {
  id: string
  row: Row
  query: string
  active: boolean
  onHover: () => void
  onPick: () => void
}) {
  const Icon = row.icon ?? CATEGORY[row.category].icon
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={() => !active && onHover()}
      // keep focus in the field until the click lands
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', active && 'bg-purple-50')}
    >
      {row.image ? (
        <img src={row.image} alt="" className={cn('h-8 w-8 shrink-0 object-cover', row.round ? 'rounded-full' : 'rounded-lg')} />
      ) : (
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center bg-gray-100 text-gray-500', row.round ? 'rounded-full' : 'rounded-lg')}>
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">
          <Highlight text={row.title} query={query} />
        </span>
        {row.subtitle && <span className="block truncate text-xs text-gray-400">{row.subtitle}</span>}
      </span>
      {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
    </button>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  const r = matchRange(query, text)
  if (!r) return <>{text}</>
  return (
    <>
      {text.slice(0, r[0])}
      <mark className="rounded-sm bg-purple-100 text-purple-900">{text.slice(r[0], r[1])}</mark>
      {text.slice(r[1])}
    </>
  )
}

/** On pages that already show their list filtered: just say what else matched. */
function AlsoFound({ sections, loading, onPick }: { sections: Section[]; loading: boolean; onPick: (c: Category) => void }) {
  if (!sections.length) return <p className="px-3 py-2 text-xs text-gray-400">{loading ? 'Searching the rest of the app…' : 'Nothing else in the app matches.'}</p>
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
      <span className="mr-1 text-xs text-gray-400">Also found:</span>
      {sections.map((s) => (
        <button
          key={s.category}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s.category)}
          className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-purple-100 hover:text-purple-800"
        >
          {CATEGORY[s.category].label} · {s.total}
          <ChevronRight className="h-3 w-3" />
        </button>
      ))}
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-sans text-[10px] text-gray-500">{children}</kbd>
}
