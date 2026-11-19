import { useCallback, useEffect, useRef, useState } from 'react'

import type { LicenseStatus, TeacherLicense } from '@/types/teaching'
import { collectObjectUrls, nowIso } from '@/components/teach/teach-utils'

/**
 * Local-only store for the teaching license (no backend yet).
 *
 * Besides the saved license it owns every `blob:` preview URL created for
 * picked files, so it can free them (URL.revokeObjectURL) once nothing shows
 * them anymore. Swapping this hook for a Supabase-backed one later keeps the
 * page and form untouched.
 */
export function useTeacherLicense() {
  const [license, setLicense] = useState<TeacherLicense | null>(null)

  /** Object URLs created and not yet revoked. */
  const liveUrls = useRef(new Set<string>())
  /** Mirror of `license` readable inside callbacks without re-creating them. */
  const savedRef = useRef<TeacherLicense | null>(null)

  const createPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    liveUrls.current.add(url)
    return url
  }, [])

  /** Revokes every live URL that `keep` does not reference. */
  const revokeAllExcept = useCallback((keep: TeacherLicense | null) => {
    const used = collectObjectUrls(keep)
    for (const url of liveUrls.current) {
      if (used.has(url)) continue
      URL.revokeObjectURL(url)
      liveUrls.current.delete(url)
    }
  }, [])

  /**
   * The form dropped a preview (removed proof, replaced photo). Free it now,
   * unless the saved license still shows it (the user may still cancel the edit).
   */
  const releasePreviewUrl = useCallback((url: string | null) => {
    if (!url || !liveUrls.current.has(url)) return
    if (collectObjectUrls(savedRef.current).has(url)) return
    URL.revokeObjectURL(url)
    liveUrls.current.delete(url)
  }, [])

  const commit = useCallback(
    (draft: TeacherLicense, status: LicenseStatus) => {
      const next: TeacherLicense = {
        ...draft,
        status,
        updatedAt: nowIso(),
        skills: draft.skills.map((s) => ({ ...s, status })),
      }
      savedRef.current = next
      setLicense(next)
      revokeAllExcept(next)
    },
    [revokeAllExcept],
  )

  const saveDraft = useCallback((draft: TeacherLicense) => commit(draft, 'draft'), [commit])

  /** Later: insert rows + upload files, then status = 'pending' on the server. */
  const submitForReview = useCallback((draft: TeacherLicense) => commit(draft, 'pending'), [commit])

  /** Edit cancelled: free previews created only for the thrown-away draft. */
  const discardDraft = useCallback(() => revokeAllExcept(savedRef.current), [revokeAllExcept])

  // Leaving the page drops the in-memory license, so free every preview.
  useEffect(() => {
    const urls = liveUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  return { license, createPreviewUrl, releasePreviewUrl, saveDraft, submitForReview, discardDraft }
}
