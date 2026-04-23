import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthProvider'
import { DeleteAccountModal } from './DeleteAccountModal'

export function AccountSection() {
  const { session } = useAuth()
  const [username, setUsername] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [passwordEmailSent, setPasswordEmailSent] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const email = session?.user?.email ?? ''
  const identities = session?.user?.identities ?? []
  const signInMethod = identities.find((i) => i.provider === 'google')
    ? 'Google'
    : 'Email + password'

  useEffect(() => {
    if (!session?.user) return
    supabase
      .from('profiles')
      .select('username,created_at')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username)
          setCreatedAt(data.created_at)
        }
      })
  }, [session])

  const handleSendPasswordReset = async () => {
    if (!email) return
    await supabase.auth.resetPasswordForEmail(email)
    setPasswordEmailSent(true)
  }

  return (
    <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <h2 className="text-xl font-normal text-gray-900">Account</h2>
      <p className="mt-0.5 text-sm text-gray-400">Authentication and irreversible actions.</p>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KV label="Email" value={email || '—'} />
        <KV label="Sign-in method" value={signInMethod} />
        <KV
          label="Account created"
          value={createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
        />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={handleSendPasswordReset}
          disabled={passwordEmailSent}
          className="rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {passwordEmailSent ? 'Email sent' : 'Send password reset email'}
        </button>
        {passwordEmailSent && <p className="text-sm text-gray-400">Check your inbox at {email}.</p>}
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-900">Danger zone</h3>
        <p className="mt-1 text-sm text-gray-500">
          Permanently delete your account and all associated data.
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-3 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
        >
          Delete account
        </button>
      </div>

      {confirmOpen && (
        <DeleteAccountModal username={username} onClose={() => setConfirmOpen(false)} />
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  )
}
