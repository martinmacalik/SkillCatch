import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, PenLine, Search } from 'lucide-react'

import { useCombobox } from '@/hooks/useCombobox'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { countryByCode } from '@/data/countries'
import {
  hasSchoolList,
  loadSchools,
  loadUniversities,
  searchInstitutions,
  type InstitutionOption,
} from '@/lib/institution-data'
import type { InstitutionType } from '@/types/teaching'
import { ComboboxList, type ComboboxOption } from './ComboboxList'

export interface InstitutionValue {
  id: string | null
  name: string
  domains: string[] | null
}

interface InstitutionComboboxProps {
  id?: string
  countryCode: string
  institutionType: InstitutionType | null
  value: InstitutionValue
  onChange: (value: InstitutionValue) => void
}

type LoadState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; items: InstitutionOption[] }

/**
 * University → searches universities.json for the country.
 * School     → searches schools/<cc>.json when that file exists.
 * Otherwise  → plain text field.
 * Mount it with key={`${type}-${country}`} so its state resets when either changes.
 */
export function InstitutionCombobox({ id, countryCode, institutionType, value, onChange }: InstitutionComboboxProps) {
  const listKind =
    institutionType === 'university' ? 'university' : institutionType === 'school' && hasSchoolList(countryCode) ? 'school' : null

  const [manual, setManual] = useState(false)
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })

  const searchable = listKind !== null && !manual
  const debouncedQuery = useDebouncedValue(value.name, 200)

  const results = useMemo(
    () => (load.status === 'ready' ? searchInstitutions(load.items, debouncedQuery) : []),
    [load, debouncedQuery],
  )

  const NOT_LISTED = results.length // index of the last, extra option
  const box = useCombobox(searchable && debouncedQuery.trim() ? results.length + 1 : 0, (i) => {
    if (i === NOT_LISTED) {
      setManual(true)
      onChange({ id: null, name: value.name, domains: null })
    } else {
      const hit = results[i]
      onChange({ id: hit.id, name: hit.name, domains: hit.domains })
    }
  })

  // Lazy: the (big) list is only downloaded when the user focuses the field.
  const ensureLoaded = () => {
    if (!listKind || load.status === 'loading' || load.status === 'ready') return
    const promise = listKind === 'university' ? loadUniversities(countryCode) : loadSchools(countryCode)
    if (!promise) return
    setLoad({ status: 'loading' })
    promise.then(
      (items) => setLoad({ status: 'ready', items }),
      () => setLoad({ status: 'error' }),
    )
  }

  const countryName = countryByCode(countryCode)?.name ?? countryCode
  const placeholder = !institutionType
    ? 'Pick an institution type first'
    : searchable
      ? listKind === 'university'
        ? `Search universities in ${countryName}…`
        : `Search schools in ${countryName}…`
      : 'Type the name'

  const options: ComboboxOption[] = [
    ...results.map((r) => ({
      key: r.id,
      content: (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{r.name}</span>
          {r.detail && <span className="block truncate text-xs text-gray-400">{r.detail}</span>}
        </span>
      ),
    })),
    {
      key: '__not-listed',
      separated: results.length > 0,
      content: (
        <span className="flex items-center gap-2 font-medium text-purple-700">
          <PenLine className="h-4 w-4" />
          My institution isn&apos;t listed
        </span>
      ),
    },
  ]

  const status =
    load.status === 'loading'
      ? 'Loading list…'
      : load.status === 'error'
        ? 'Could not load the list. Type the name instead.'
        : results.length === 0
          ? 'No match'
          : undefined

  return (
    <div>
      <div className="relative">
        {searchable && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
            {load.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </span>
        )}
        <input
          id={id}
          className={searchable ? 'input pl-9' : 'input'}
          placeholder={placeholder}
          disabled={!institutionType}
          maxLength={120}
          value={value.name}
          onFocus={() => {
            ensureLoaded()
            if (searchable) box.setOpen(true)
          }}
          onBlur={() => box.setOpen(false)}
          onChange={(e) => {
            // typing always un-links a previously picked entry
            onChange({ id: null, name: e.target.value, domains: null })
            if (searchable) box.openFresh()
          }}
          {...(searchable ? box.inputProps : {})}
        />
        {searchable && box.open && debouncedQuery.trim() && (
          <ComboboxList
            listId={box.listId}
            optionId={box.optionId}
            active={box.active}
            onHover={box.setActive}
            onPick={box.pick}
            status={status}
            options={options}
          />
        )}
      </div>

      {/* helper line under the field */}
      {value.id ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Picked from the {listKind === 'university' ? 'university' : 'school'} list
        </p>
      ) : manual ? (
        <button
          type="button"
          onClick={() => setManual(false)}
          className="mt-1.5 cursor-pointer text-xs font-medium text-purple-700 hover:underline"
        >
          Search the list instead
        </button>
      ) : institutionType === 'school' && !listKind ? (
        <p className="mt-1.5 text-xs text-gray-400">We don&apos;t have a school list for {countryName} yet. Type the name.</p>
      ) : null}
    </div>
  )
}
