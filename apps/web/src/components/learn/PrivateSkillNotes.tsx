import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { getOrCreateUserSkillNotes, updateUserSkillNotes } from '@/lib/learn-queries'

export function PrivateSkillNotes({ skillNodeId }: { skillNodeId: string }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getOrCreateUserSkillNotes(skillNodeId).then(data => {
      const t = (data?.content as Record<string, unknown> | undefined)?.text
      setText(typeof t === 'string' ? t : '')
      setLoading(false)
    })
  }, [skillNodeId])

  const onChange = (val: string) => {
    setText(val)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateUserSkillNotes(skillNodeId, { text: val })
    }, 600)
  }

  if (loading) return null

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Your private notes
        </h2>
      </div>
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        rows={6}
        placeholder="Notes only you can see…"
        className="w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-black focus:bg-white"
      />
    </section>
  )
}
