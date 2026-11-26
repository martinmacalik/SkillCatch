import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useDropUp } from './useDropUp'
import { fetchShareableSkills, type ShareableSkill } from '@/lib/chat-queries'
import { colorForIndex } from '@/pages/skills/types'

// search + 4 rows of the list + footer + padding
const DROPDOWN_MAX_HEIGHT = 360

interface Props {
  ownerId: string
  mode: 'single' | 'multi'
  selected: string[]
  onSave: (ids: string[]) => void
  onClose: () => void
  inline?: boolean // inside an empty block instead of a dropdown
}

// MY skills (approved ones only, same rule as sharing in chat).
// multi: checkboxes, order = the order you ticked them; single: one click picks.
// As a dropdown it opens below its parent; no room below → it flips up and the
// search moves to the bottom, next to the button you clicked.
export function SkillPicker({ ownerId, mode, selected, onSave, onClose, inline = false }: Props) {
  const [skills, setSkills] = useState<ShareableSkill[] | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>(selected)
  const [up, attach, rootRef] = useDropUp(DROPDOWN_MAX_HEIGHT, inline)

  useEffect(() => {
    void fetchShareableSkills(ownerId).then(setSkills).catch(() => setSkills([]))
  }, [ownerId])

  // close on a click outside (multi saves what's ticked)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      if (mode === 'multi') onSave(picked)
      onClose()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [mode, picked, onSave, onClose, rootRef])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (skills ?? []).filter(s => !q || s.name.toLowerCase().includes(q))
  }, [skills, query])

  const toggle = (id: string) => {
    if (mode === 'single') { onSave([id]); onClose(); return }
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  }

  return (
    <div
      ref={attach}
      // flex-col-reverse: flipped up, the same children render bottom-to-top
      className={`flex gap-1 ${up ? 'flex-col-reverse' : 'flex-col'} ${
        inline
          ? 'w-full'
          : `absolute left-0 z-30 w-72 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ${up ? 'bottom-full mb-1' : 'top-full mt-1'}`
      }`}
    >
      <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
        <Search className="h-4 w-4 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your skills…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
      </div>

      <div className={`${inline ? 'max-h-36' : 'max-h-64'} overflow-y-auto`}>
        {skills === null ? (
          <p className="px-3 py-4 text-center text-xs text-gray-400">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-gray-400">
            {skills.length === 0 ? 'Add skills to your profile first.' : 'No skill matches.'}
          </p>
        ) : (
          visible.map(s => {
            const on = picked.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
              >
                {s.image_url ? (
                  <img src={s.image_url} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className={`h-7 w-7 shrink-0 rounded-lg ${colorForIndex(s.name.length)}`} />
                )}
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {mode === 'multi' && (
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold ${
                    on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-transparent'
                  }`}>
                    {on ? picked.indexOf(s.id) + 1 : <Check className="h-3 w-3" />}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {mode === 'multi' && (
        <div className={`flex items-center justify-between border-gray-100 px-2 ${up ? 'border-b pb-2' : 'border-t pt-2'}`}>
          <span className="text-xs text-gray-400">{picked.length} selected</span>
          <button
            onClick={() => { onSave(picked); onClose() }}
            className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-gray-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
