import { useEffect, useState } from 'react'
import { getMyRoles } from '@/lib/learn-queries'
import { useAuth } from '@/contexts/AuthProvider'

export function useIsEditor() {
  const { session } = useAuth()
  const [isEditor, setIsEditor] = useState(false)

  useEffect(() => {
    if (!session) { setIsEditor(false); return }
    getMyRoles().then(roles => {
      setIsEditor(roles.includes('admin') || roles.includes('editor'))
    })
  }, [session])

  return isEditor
}
