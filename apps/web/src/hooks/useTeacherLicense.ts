import { useCallback, useEffect, useRef, useState } from 'react'

import type { TeacherLicense } from '@/types/teaching'
import {
  fetchMyLicenseState,
  fetchMySkillOptions,
  saveSubmission,
  withdrawSubmission,
  type MyLicenseState,
} from '@/lib/license-queries'

const EMPTY_STATE: MyLicenseState = { live: null, open: null, rejected: null }

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return 'Something went wrong.'
}

/**
 * The teacher's license as stored in Supabase + the user's skills for the form.
 *
 * Also owns the blob: preview URLs of files picked in the form. Saved files
 * come back from the server as Storage URLs, so after a save (or a cancel)
 * every preview can be revoked.
 */
export function useTeacherLicense(userId: string | undefined, displayName: string) {
  const [state, setState] = useState<MyLicenseState>(EMPTY_STATE)
  const [skillOptions, setSkillOptions] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const liveUrls = useRef(new Set<string>())

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const [next, skills] = await Promise.all([fetchMyLicenseState(userId, displayName), fetchMySkillOptions(userId)])
      setState(next)
      setSkillOptions(skills)
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [userId, displayName])

  useEffect(() => {
    void load()
  }, [load])

  /* ── blob: previews ── */

  const createPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    liveUrls.current.add(url)
    return url
  }, [])

  /** A preview left the form (removed proof, replaced photo). */
  const releasePreviewUrl = useCallback((url: string | null) => {
    if (!url || !liveUrls.current.has(url)) return
    URL.revokeObjectURL(url)
    liveUrls.current.delete(url)
  }, [])

  const revokeAll = useCallback(() => {
    for (const url of liveUrls.current) URL.revokeObjectURL(url)
    liveUrls.current.clear()
  }, [])

  // leaving the page: free every preview
  useEffect(() => revokeAll, [revokeAll])

  /* ── actions ── */

  /** Uploads files, stores the draft (submit = false) or sends it for review. */
  const save = useCallback(
    async (draft: TeacherLicense, submit: boolean) => {
      if (!userId) throw new Error('Not signed in.')
      await saveSubmission({ userId, draft, submit, openId: state.open?.id ?? null })
      await load()
      revokeAll()
    },
    [userId, state.open?.id, load, revokeAll],
  )

  /** Deletes the open draft / pulls a change back from review. */
  const withdraw = useCallback(async () => {
    if (!state.open) return
    await withdrawSubmission(state.open.id)
    await load()
  }, [state.open, load])

  return {
    ...state,
    skillOptions,
    loading,
    error,
    reload: load,
    save,
    withdraw,
    discardPreviews: revokeAll,
    createPreviewUrl,
    releasePreviewUrl,
  }
}
