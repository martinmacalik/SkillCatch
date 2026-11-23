import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/cn'
import { searchKey } from '@/lib/searchKey'
import { useCombobox } from '@/hooks/useCombobox'
import { ComboboxList } from '@/components/teach/ComboboxList'
import type { TrackableSkill } from '@/lib/timer-queries'

const GROUP_LABELS = { pinned: 'Pinned', learning: 'Learning', other: '' } as const

interface Props {
  skills: TrackableSkill[]
  value: string // '' = all skills
  onChange: (skillId: string) => void
  className?: string
}

/** Compact "All skills / one skill" filter: same dropdown as the Teach comboboxes, type to search. */
export function SkillFilterCombobox({ skills, value, onChange, className }: Props) {
  // null = not typing, the input shows the selected skill
  const [query, setQuery] = useState<string | null>(null)
  const selected = skills.find(s => s.id === value)
  const selectedLabel = selected?.name ?? 'All skills'

  // empty query → "All skills" + every skill; typing → only matches, names starting with it first
  const rows = useMemo<(TrackableSkill | null)[]>(() => {
    const q = searchKey(query ?? '').trim()
    if (!q) return [null, ...skills]
    return skills
      .map(s => ({ s, key: searchKey(s.name) }))
      .filter(x => x.key.includes(q))
      .sort((a, b) => Number(!a.key.startsWith(q)) - Number(!b.key.startsWith(q)))
      .map(x => x.s)
  }, [query, skills])

  const box = useCombobox(rows.length, i => {
    onChange(rows[i]?.id ?? '')
    setQuery(null)
  })

  return (
    <div className={cn('relative w-40', className)}>
      <input
        className="h-8 w-full truncate rounded-lg bg-gray-100 pr-7 pl-3 text-xs font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-purple-200 focus:outline-none"
        placeholder="Search skill…"
        aria-label="Filter by skill"
        value={query ?? selectedLabel}
        onFocus={e => {
          e.target.select()
          // open on the current choice (row 0 = All skills)
          box.setActive(Math.max(0, rows.findIndex(r => (r?.id ?? '') === value)))
          box.setOpen(true)
        }}
        onBlur={() => {
          setQuery(null)
          box.setOpen(false)
        }}
        onChange={e => {
          setQuery(e.target.value)
          box.openFresh()
        }}
        {...box.inputProps}
      />
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 transition-transform',
          box.open && 'rotate-180',
        )}
      />
      {box.open && (
        <ComboboxList
          className="left-auto w-64"
          listId={box.listId}
          optionId={box.optionId}
          active={box.active}
          onHover={box.setActive}
          onPick={box.pick}
          status={rows.length === 0 ? 'No skill found' : undefined}
          options={rows.map(r => ({
            key: r?.id ?? '__all',
            content: (
              <span className="flex items-center gap-2">
                <span className={cn('flex-1 truncate', !r && 'font-medium')}>{r?.name ?? 'All skills'}</span>
                {r && GROUP_LABELS[r.group] && <span className="text-[11px] text-gray-400">{GROUP_LABELS[r.group]}</span>}
                {(r?.id ?? '') === value && <Check className="h-4 w-4 shrink-0 text-purple-700" />}
              </span>
            ),
          }))}
        />
      )}
    </div>
  )
}
