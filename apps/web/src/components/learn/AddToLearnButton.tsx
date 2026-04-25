import { useEffect, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { addSkillToLearn, removeSkillFromLearn } from '@/lib/learn-queries'

export function AddToLearnButton({ skillNodeId }: { skillNodeId: string }) {
  const [added, setAdded] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('user_learning_skills')
      .select('skill_node_id')
      .eq('skill_node_id', skillNodeId)
      .maybeSingle()
      .then(({ data }) => setAdded(!!data))
  }, [skillNodeId])

  if (added === null) return null

  const toggle = async () => {
    setBusy(true)
    try {
      if (added) {
        await removeSkillFromLearn(skillNodeId)
        setAdded(false)
      } else {
        await addSkillToLearn(skillNodeId)
        setAdded(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
        added
          ? 'bg-black text-white hover:bg-gray-800'
          : 'border border-gray-200 text-black hover:border-black'
      }`}
    >
      {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {added ? 'In your Learn' : 'Add to Learn'}
    </button>
  )
}
