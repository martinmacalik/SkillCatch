import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { validateUsername, usernameErrorMessage } from '../../lib/usernameRules'
import { COUNTRIES } from '../../lib/countries'
import { LANGUAGES } from '../../lib/languages'
import { AvatarUploader } from './AvatarUploader'

interface IdentityRow {
  avatar_url: string | null
  first_name: string | null
  last_name: string | null
  username: string | null
  bio: string | null
  country: string | null
  city: string | null
  primary_language: string | null
}

const EMPTY: IdentityRow = {
  avatar_url: null,
  first_name: '',
  last_name: '',
  username: '',
  bio: '',
  country: '',
  city: '',
  primary_language: '',
}

export function IdentitySection({ userId }: { userId: string }) {
  const [original, setOriginal] = useState<IdentityRow>(EMPTY)
  const [row, setRow] = useState<IdentityRow>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [usernameTaken, setUsernameTaken] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('avatar_url,first_name,last_name,username,bio,country,city,primary_language')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const r: IdentityRow = {
          avatar_url: data.avatar_url,
          first_name: data.first_name ?? '',
          last_name:  data.last_name  ?? '',
          username:   data.username   ?? '',
          bio:        data.bio        ?? '',
          country:    data.country    ?? '',
          city:       data.city       ?? '',
          primary_language: data.primary_language ?? '',
        }
        setOriginal(r)
        setRow(r)
      })
  }, [userId])

  const usernameErr = row.username
    ? validateUsername(row.username)
    : null
  const dirty = JSON.stringify(row) !== JSON.stringify(original)
  const bioLen = (row.bio ?? '').length
  const bioOver = bioLen > 160

  const handleSave = async () => {
    setSaving(true)
    setSaveErr(null)
    setSaved(false)
    setUsernameTaken(false)
    const patch = {
      first_name:       row.first_name || null,
      last_name:        row.last_name || null,
      username:         row.username || null,
      bio:              row.bio || null,
      country:          row.country || null,
      city:             row.city || null,
      primary_language: row.primary_language || null,
      updated_at:       new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    setSaving(false)
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        setUsernameTaken(true)
      } else {
        setSaveErr(error.message)
      }
      return
    }
    setOriginal(row)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const canSave = dirty && !saving && !usernameErr && !bioOver

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
    >
      <h2 className="text-xl font-normal text-gray-900">Identity</h2>
      <p className="mt-0.5 text-sm text-gray-400">How you appear to yourself and others.</p>

      <div className="mt-6">
        <AvatarUploader
          userId={userId}
          currentUrl={row.avatar_url}
          onChange={(url) => {
            setRow((r) => ({ ...r, avatar_url: url }))
            setOriginal((o) => ({ ...o, avatar_url: url }))
          }}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="First name">
          <input
            className="input"
            value={row.first_name ?? ''}
            onChange={(e) => setRow({ ...row, first_name: e.target.value })}
          />
        </Field>
        <Field label="Last name">
          <input
            className="input"
            value={row.last_name ?? ''}
            onChange={(e) => setRow({ ...row, last_name: e.target.value })}
          />
        </Field>

        <Field label="Username" error={
          usernameTaken ? 'That username is taken.' :
          usernameErr ? usernameErrorMessage(usernameErr) : undefined
        }>
          <input
            className="input"
            value={row.username ?? ''}
            onChange={(e) =>
              setRow({ ...row, username: e.target.value.toLowerCase() })
            }
            placeholder="e.g. martin_m"
          />
        </Field>
        <Field label="Primary language">
          <select
            className="input"
            value={row.primary_language ?? ''}
            onChange={(e) => setRow({ ...row, primary_language: e.target.value })}
          >
            <option value="">—</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Country">
          <select
            className="input"
            value={row.country ?? ''}
            onChange={(e) => setRow({ ...row, country: e.target.value })}
          >
            <option value="">—</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="City">
          <input
            className="input"
            value={row.city ?? ''}
            onChange={(e) => setRow({ ...row, city: e.target.value })}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Bio"
            error={bioOver ? `${bioLen}/160` : undefined}
            hint={!bioOver ? `${bioLen}/160` : undefined}
          >
            <textarea
              className="input min-h-[80px] resize-y"
              maxLength={200}
              value={row.bio ?? ''}
              onChange={(e) => setRow({ ...row, bio: e.target.value })}
              placeholder="One line about you."
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <p className="text-sm text-emerald-600">Saved.</p>}
        {saveErr && <p className="text-sm text-rose-600">{saveErr}</p>}
      </div>
    </div>
  )
}

function Field({
  label, error, hint, children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-gray-400">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
      {!error && hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  )
}
