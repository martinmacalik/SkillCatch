import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface Props {
  username: string | null
  onClose: () => void
}

export function DeleteAccountModal({ username, onClose }: Props) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const required = username ?? ''
  const canDelete = required !== '' && typed === required && !busy

  const handleDelete = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('delete_own_account')
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Delete your account</h3>
        <p className="mt-2 text-sm text-gray-600">
          This removes your profile, skills, teaching offers, questions, and proposals
          permanently. This cannot be undone.
        </p>

        {required === '' ? (
          <p className="mt-4 text-sm text-rose-600">
            Set a username first in the Identity section — we use it as the
            delete confirmation.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-gray-700">
              Type <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">{required}</code> to confirm.
            </p>
            <input
              autoFocus
              className="input mt-2"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </>
        )}

        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  )
}
