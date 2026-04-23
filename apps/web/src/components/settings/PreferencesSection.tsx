import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useTheme } from '../../contexts/ThemeProvider'
import type { ThemePreference } from '../../contexts/ThemeProvider'

type Notif = {
  notif_weekly_digest: boolean
  notif_qa_answers: boolean
  notif_proposal_updates: boolean
}

const EMPTY_NOTIF: Notif = {
  notif_weekly_digest: true,
  notif_qa_answers: true,
  notif_proposal_updates: true,
}

export function PreferencesSection({ userId }: { userId: string }) {
  const { theme, setTheme } = useTheme()
  const [notif, setNotif] = useState<Notif>(EMPTY_NOTIF)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('notif_weekly_digest,notif_qa_answers,notif_proposal_updates')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setNotif(data as Notif)
      })
  }, [userId])

  const toggle = async (key: keyof Notif) => {
    const next = { ...notif, [key]: !notif[key] }
    setNotif(next)
    await supabase.from('profiles').update({ [key]: next[key] }).eq('id', userId)
  }

  return (
    <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <h2 className="text-xl font-normal text-gray-900">Preferences</h2>
      <p className="mt-0.5 text-sm text-gray-400">Theme and notifications.</p>

      <div className="mt-6">
        <p className="mb-2 text-xs uppercase tracking-widest text-gray-400">Theme</p>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as ThemePreference[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void setTheme(t)}
              className={[
                'rounded-xl border px-4 py-2 text-sm font-medium transition',
                theme === t
                  ? 'border-purple-700 bg-purple-700 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-gray-400">Notifications</p>
        <div className="space-y-3">
          <Toggle
            label="Weekly digest"
            description="A summary of new skills, resources, and popular questions once per week."
            checked={notif.notif_weekly_digest}
            onChange={() => void toggle('notif_weekly_digest')}
          />
          <Toggle
            label="Answers to my questions"
            description="Ping me when someone answers a question I've asked."
            checked={notif.notif_qa_answers}
            onChange={() => void toggle('notif_qa_answers')}
          />
          <Toggle
            label="Updates on my proposals"
            description="Ping me when an admin approves or rejects a skill-tree change I submitted."
            checked={notif.notif_proposal_updates}
            onChange={() => void toggle('notif_proposal_updates')}
          />
        </div>
      </div>
    </div>
  )
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <span className="flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
      </span>
      <button
        role="switch"
        aria-checked={checked}
        type="button"
        onClick={onChange}
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-purple-700' : 'bg-gray-300',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  )
}
