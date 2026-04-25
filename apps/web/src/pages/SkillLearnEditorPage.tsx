import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import {
  getSkillLearnPageBySlug,
  ensureLearningPage,
  setPageStatus,
  createLearningBlock,
  updateLearningBlock,
  deleteLearningBlock,
  type LearningBlock,
  type BlockType,
} from '@/lib/learn-queries'
import { useIsEditor } from '@/hooks/useIsEditor'

const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: 'heading',       label: 'Heading' },
  { type: 'text',          label: 'Text' },
  { type: 'callout',       label: 'Callout' },
  { type: 'resource_list', label: 'Resources' },
  { type: 'flashcards',    label: 'Flashcards' },
  { type: 'checklist',     label: 'Checklist' },
]

const BLOCK_TEMPLATES: Record<BlockType, Record<string, unknown>> = {
  heading:       { level: 2, text: 'Section heading' },
  text:          { text: '' },
  callout:       { tone: 'tip', text: 'Helpful tip…' },
  resource_list: { items: [{ title: '', url: '', description: '' }] },
  flashcards:    { cards: [{ front: '', back: '' }] },
  checklist:     { items: [{ text: '', done: false }] },
}

export default function SkillLearnEditorPage() {
  const { skillSlug } = useParams<{ skillSlug: string }>()
  const navigate = useNavigate()
  const isEditor = useIsEditor()

  const [pageId, setPageId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [blocks, setBlocks] = useState<LearningBlock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!skillSlug) return
    getSkillLearnPageBySlug(skillSlug).then(async d => {
      if (!d) { setLoading(false); return }
      const page = d.page ?? await ensureLearningPage(d.node.id)
      setPageId(page.id)
      setStatus(page.status)
      setBlocks(d.blocks)
      setLoading(false)
    })
  }, [skillSlug])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
      </div>
    )
  }

  if (!isEditor) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-sm text-gray-400">You need editor access.</p>
      </div>
    )
  }

  if (!pageId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-sm text-gray-400">Skill not found.</p>
      </div>
    )
  }

  const addBlock = async (type: BlockType) => {
    const block = await createLearningBlock(pageId, type, blocks.length + 1, BLOCK_TEMPLATES[type])
    setBlocks(prev => [...prev, block])
  }

  const togglePublished = async () => {
    const next = status === 'draft' ? 'published' : 'draft'
    if (next === 'published' && !confirm('Publish this page so all users can read it?')) return
    await setPageStatus(pageId, next)
    setStatus(next)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to={`/skills/${skillSlug}/learn`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to page
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-black">Editing Learn page</h1>
        <div className="flex gap-2">
          <button
            onClick={togglePublished}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              status === 'published'
                ? 'bg-black text-white hover:bg-gray-800'
                : 'border border-gray-200 text-black hover:border-black'
            }`}
          >
            {status === 'published' ? 'Published' : 'Publish'}
          </button>
          <button
            onClick={() => navigate(`/skills/${skillSlug}/learn`)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:border-black"
          >
            Done
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {blocks.map(b => (
          <BlockEditorRow
            key={b.id}
            block={b}
            onChange={c => {
              setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, content: c } : x))
              updateLearningBlock(b.id, c)
            }}
            onDelete={async () => {
              await deleteLearningBlock(b.id)
              setBlocks(prev => prev.filter(x => x.id !== b.id))
            }}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {BLOCK_TYPES.map(t => (
          <button
            key={t.type}
            onClick={() => addBlock(t.type)}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-black hover:text-black"
          >
            <Plus className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function BlockEditorRow({
  block, onChange, onDelete,
}: {
  block: LearningBlock
  onChange: (c: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {block.type}
        </span>
        <button onClick={onDelete} className="text-gray-300 hover:text-pink-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <textarea
        defaultValue={JSON.stringify(block.content, null, 2)}
        onBlur={e => {
          try {
            onChange(JSON.parse(e.target.value))
            setError(null)
          } catch (err) {
            setError('Invalid JSON — fix and tab out again to save.')
          }
        }}
        rows={6}
        spellCheck={false}
        className="w-full resize-y rounded-xl bg-gray-50 p-3 font-mono text-xs outline-none focus:bg-white"
      />
      {error && <p className="mt-2 text-xs text-pink-600">{error}</p>}
    </div>
  )
}
