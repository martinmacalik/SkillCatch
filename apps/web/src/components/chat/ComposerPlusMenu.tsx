import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Plus, Search, Sparkles } from 'lucide-react'
import { fetchShareableSkills, type ShareableSkill } from '@/lib/chat-queries'
import { colorForIndex } from '@/pages/skills/types'
import { RewardHint } from '@/components/rewards/RewardHint'

interface Props {
  myId: string
  disabled: boolean
  onShareSkill: (skillNodeId: string) => Promise<void>
}

// "+" next to the message input: a menu of attachments, so far just
// "Share skill progress" → searchable list of my skills.
export function ComposerPlusMenu({ myId, disabled, onShareSkill }: Props) {
  const [view, setView] = useState<'closed' | 'menu' | 'skills'>('closed')
  const rootRef = useRef<HTMLDivElement>(null)

  // close on a click outside
  useEffect(() => {
    if (view === 'closed') return
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setView('closed')
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [view])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setView(v => (v === 'closed' ? 'menu' : 'closed'))}
        disabled={disabled}
        title="More"
        className={`flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 ${
          view !== 'closed' ? 'rotate-45 bg-gray-100 text-gray-900' : ''
        }`}
      >
        <Plus className="h-5 w-5" />
      </button>

      {view === 'menu' && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl bg-white p-1.5 shadow-lg">
          <button
            onClick={() => setView('skills')}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
          >
            <Sparkles className="h-4 w-4 text-purple-600" /> Share skill progress
          </button>
        </div>
      )}

      {view === 'skills' && (
        <SkillPicker
          myId={myId}
          onBack={() => setView('menu')}
          onClose={() => setView('closed')}
          onPick={async id => {
            await onShareSkill(id)
            setView('closed')
          }}
        />
      )}
    </div>
  )
}

interface PickerProps {
  myId: string
  onBack: () => void
  onClose: () => void
  onPick: (skillNodeId: string) => Promise<void>
}

function SkillPicker({ myId, onBack, onClose, onPick }: PickerProps) {
  const [skills, setSkills] = useState<ShareableSkill[] | null>(null)
  const [query, setQuery] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchShareableSkills(myId)
      .then(data => { if (!cancelled) setSkills(data) })
      .catch(() => { if (!cancelled) setError('Could not load your skills.') })
    return () => { cancelled = true }
  }, [myId])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return (skills ?? []).filter(s => normalize(s.name).includes(q))
  }, [skills, query])

  const pick = async (id: string) => {
    if (sendingId) return
    setSendingId(id)
    setError(null)
    try {
      await onPick(id)
    } catch {
      setError('Skill could not be shared. Try again.')
      setSendingId(null)
    }
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 flex w-72 flex-col rounded-2xl bg-white p-1.5 shadow-lg">
      <div className="flex items-center gap-1 px-1 pb-1.5">
        <button onClick={onBack} title="Back" className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-gray-900">Share skill progress</p>
        <RewardHint id="share_skill" className="ml-auto pr-1.5" />
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'Enter' && filtered[0]) void pick(filtered[0].id)
          }}
          placeholder="Search your skills…"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>

      <div className="skills-scroll mt-1 max-h-64 overflow-y-auto">
        {skills === null && !error ? (
          <p className="px-3 py-4 text-center text-xs text-gray-400">Loading…</p>
        ) : filtered.length === 0 && !error ? (
          <p className="px-3 py-4 text-center text-xs text-gray-400">
            {skills?.length ? 'No skill matches.' : 'You have no skills in your profile yet.'}
          </p>
        ) : (
          filtered.map(s => (
            <button
              key={s.id}
              onClick={() => void pick(s.id)}
              disabled={sendingId !== null}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
            >
              {s.image_url ? (
                <img src={s.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className={`h-8 w-8 shrink-0 rounded-lg ${colorForIndex(s.name.length)}`} />
              )}
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {sendingId === s.id && <span className="text-xs text-gray-400">Sending…</span>}
            </button>
          ))
        )}
        {error && <p className="px-3 py-2 text-center text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}

// "Kytára" matches "kyt"
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
