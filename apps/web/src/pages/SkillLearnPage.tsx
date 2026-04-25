import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Pencil, ArrowLeft } from 'lucide-react'
import { getSkillLearnPageBySlug, type LearningBlock, type LearningPage, type SkillNode } from '@/lib/learn-queries'
import { LearningBlockRenderer } from '@/components/learn/LearningBlockRenderer'
import { AddToLearnButton } from '@/components/learn/AddToLearnButton'
import { PrivateSkillNotes } from '@/components/learn/PrivateSkillNotes'
import { useIsEditor } from '@/hooks/useIsEditor'

interface PageData {
  node: SkillNode
  page: LearningPage | null
  blocks: LearningBlock[]
}

export default function SkillLearnPage() {
  const { skillSlug } = useParams<{ skillSlug: string }>()
  const isEditor = useIsEditor()
  const [data, setData] = useState<PageData | null | 'missing'>(null)

  useEffect(() => {
    if (!skillSlug) return
    getSkillLearnPageBySlug(skillSlug).then(d => {
      setData(d ?? 'missing')
    })
  }, [skillSlug])

  if (data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
      </div>
    )
  }

  if (data === 'missing') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-sm text-gray-400">Skill not found.</p>
        <Link to="/dashboard/learn" className="mt-4 inline-block text-sm font-medium text-black hover:underline">
          Back to your learning
        </Link>
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to="/dashboard/learn"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" />
        Your learning
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400">Skill</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-black">{data.node.name}</h1>
          {data.page?.status === 'draft' && (
            <span className="mt-3 inline-block rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700">
              Draft — not yet published
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AddToLearnButton skillNodeId={data.node.id} />
          {isEditor && (
            <Link
              to={`/skills/${skillSlug}/learn/edit`}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-black"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
        </div>
      </header>

      {data.page && data.blocks.length > 0 ? (
        <section className="mt-10 flex flex-col gap-6">
          {data.blocks.map(b => (
            <LearningBlockRenderer key={b.id} block={b} />
          ))}
        </section>
      ) : (
        <p className="mt-10 rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
          No content yet for this skill.
        </p>
      )}

      <hr className="my-12 border-gray-100" />
      <PrivateSkillNotes skillNodeId={data.node.id} />
    </article>
  )
}
