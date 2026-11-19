import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { useCombobox } from '@/hooks/useCombobox'
import { ALL_COUNTRIES, countryByCode, flagEmoji } from '@/data/countries'
import { ComboboxList } from './ComboboxList'
import { searchKey } from '@/lib/searchKey'

/** Other names people type, so "cesko" or "uk" still find the country. */
const ALIASES: Record<string, string> = {
  CZ: 'Czech Republic Česko Česká republika',
  SK: 'Slovensko',
  DE: 'Deutschland Německo',
  AT: 'Österreich Rakousko',
  PL: 'Polska Polsko',
  GB: 'UK Great Britain England Britain Velká Británie',
  US: 'USA America United States of America',
  NL: 'Holland',
}

const COUNTRY_KEYS = ALL_COUNTRIES.map((c) => ({
  country: c,
  key: searchKey(`${c.name} ${c.code} ${ALIASES[c.code] ?? ''}`),
}))

interface CountryComboboxProps {
  id?: string
  value: string
  onChange: (code: string) => void
}

/** All ISO 3166 countries; type to filter (accent-insensitive), arrows + Enter to pick. */
export function CountryCombobox({ id, value, onChange }: CountryComboboxProps) {
  // null = not typing, the input shows the selected country
  const [query, setQuery] = useState<string | null>(null)
  const selected = countryByCode(value)

  const matches = useMemo(() => {
    const q = searchKey(query ?? '').trim()
    if (!q) return ALL_COUNTRIES
    const hits = COUNTRY_KEYS.filter((c) => c.key.includes(q))
    // "cz" → Czechia before "Cameroon … cz"; names starting with the query first
    return hits
      .sort((a, b) => Number(!a.key.startsWith(q)) - Number(!b.key.startsWith(q)))
      .map((c) => c.country)
  }, [query])

  const box = useCombobox(matches.length, (i) => {
    onChange(matches[i].code)
    setQuery(null)
  })

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base leading-none">
        {selected ? flagEmoji(selected.code) : '🌐'}
      </span>
      <input
        id={id}
        className="input pr-9 pl-10"
        placeholder="Search country…"
        value={query ?? selected?.name ?? ''}
        onFocus={(e) => {
          e.target.select()
          // open on the current country, not at the top of the alphabet
          box.setActive(Math.max(0, ALL_COUNTRIES.findIndex((c) => c.code === value)))
          box.setOpen(true)
        }}
        onBlur={() => {
          setQuery(null)
          box.setOpen(false)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          box.openFresh()
        }}
        {...box.inputProps}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      {box.open && (
        <ComboboxList
          listId={box.listId}
          optionId={box.optionId}
          active={box.active}
          onHover={box.setActive}
          onPick={box.pick}
          status={matches.length === 0 ? 'No country found' : undefined}
          options={matches.map((c) => ({
            key: c.code,
            content: (
              <span className="flex items-center gap-2.5">
                <span className="text-base leading-none">{flagEmoji(c.code)}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-gray-400">{c.code}</span>
              </span>
            ),
          }))}
        />
      )}
    </div>
  )
}
