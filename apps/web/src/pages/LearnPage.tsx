import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Check, Send, X, Clock, Info } from 'lucide-react'
import {
  getDefaultLearnSkillId,
  getSkillLearnPageById,
  getUserLearningSkills,
  ensureLearningPage,
  setPageStatus,
  createLearningBlock,
  updateLearningBlock,
  deleteLearningBlock,
  touchSkillLastOpened,
  submitLearningSuggestion,
  getMyPendingSuggestion,
  type LearningBlock,
  type LearningPage,
  type SkillNode,
  type UserLearningSkill,
  type BlockType,
  type ProposedBlock,
} from '@/lib/learn-queries'
import { useIsEditor } from '@/hooks/useIsEditor'
import { LearningBlockRenderer } from '@/components/learn/LearningBlockRenderer'
import { LearnRightPanel } from '@/components/learn/LearnRightPanel'
import { AddBlockMenu } from '@/components/learn/AddBlockMenu'
import { EditableBlockRow } from '@/components/learn/EditableBlockRow'
import { AddToLearnButton } from '@/components/learn/AddToLearnButton'
import { EditInfoPanel } from '@/components/learn/EditInfoPanel'

const BLOCK_TEMPLATES: Record<BlockType, Record<string, unknown>> = {
  heading:       { level: 2, text: 'Section heading' },
  text:          { text: '' },
  callout:       { tone: 'tip', text: 'Helpful tip…' },
  resource_list: { items: [{ title: '', url: '', description: '' }] },
  flashcards:    { cards: [{ front: '', back: '' }] },
  checklist:     { items: [{ text: '', done: false }] },
}

interface PageData {
  node: SkillNode
  page: LearningPage | null
  blocks: LearningBlock[]
}

interface PendingSuggestion {
  id: string
  created_at: string
  message: string | null
}

// In suggestion mode the same shape as LearningBlock — but `id` may be a
// locally-generated tempId for blocks the submitter just added.
interface DraftBlock extends LearningBlock {
  isLocal?: boolean
}

type EditMode = 'idle' | 'direct' | 'suggestion'

export default function LearnPage() {
  const { skillId: skillIdParam } = useParams<{ skillId?: string }>()
  const navigate = useNavigate()
  const isEditor = useIsEditor()

  const [activeSkillId, setActiveSkillId] = useState<string | null>(skillIdParam ?? null)
  const [data, setData] = useState<PageData | null | 'missing' | 'empty'>(null)
  const [learningSkills, setLearningSkills] = useState<UserLearningSkill[]>([])

  const [editMode, setEditMode] = useState<EditMode>('idle')
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  // Suggestion-mode-only: a working copy of blocks the user is editing locally.
  const [draftBlocks, setDraftBlocks] = useState<DraftBlock[]>([])
  const [suggestionMessage, setSuggestionMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null)

  // ── Resolve which skill to show ──
  useEffect(() => {
    if (skillIdParam) {
      setActiveSkillId(skillIdParam)
      return
    }
    getDefaultLearnSkillId().then(id => {
      if (id) navigate(`/dashboard/learn/${id}`, { replace: true })
      else { setActiveSkillId(null); setData('empty') }
    })
  }, [skillIdParam, navigate])

  // ── Fetch active skill's page + blocks + this user's pending suggestion ──
  useEffect(() => {
    if (!activeSkillId) return
    setData(null)
    setEditMode('idle')
    getSkillLearnPageById(activeSkillId).then(d => setData(d ?? 'missing'))
    getMyPendingSuggestion(activeSkillId).then(setPendingSuggestion)
    touchSkillLastOpened(activeSkillId)
  }, [activeSkillId])

  // ── Fetch the Learning column once ──
  useEffect(() => {
    getUserLearningSkills().then(setLearningSkills)
  }, [])

  const switchSkill = (id: string) => navigate(`/dashboard/learn/${id}`)

  // ── Edit-mode entry ──
  const enterEditMode = async () => {
    if (data === null || data === 'missing' || data === 'empty') return
    if (isEditor) {
      // Editors edit the live page. Lazy-create the page row on first edit.
      if (!data.page) {
        const page = await ensureLearningPage(data.node.id)
        setData({ ...data, page })
      }
      setEditMode('direct')
    } else {
      // Non-editors edit a local draft that they'll submit as a suggestion.
      setDraftBlocks(data.blocks.map(b => ({ ...b })))
      setSuggestionMessage('')
      setEditMode('suggestion')
    }
  }

  // ── Direct (editor) mutations ──
  const directAddBlock = async (type: BlockType) => {
    if (data === null || data === 'missing' || data === 'empty' || !data.page) return
    const block = await createLearningBlock(data.page.id, type, data.blocks.length + 1, BLOCK_TEMPLATES[type])
    setData({ ...data, blocks: [...data.blocks, block] })
  }
  const directEditBlock = (id: string, content: Record<string, unknown>) => {
    if (data === null || data === 'missing' || data === 'empty') return
    setData({ ...data, blocks: data.blocks.map(b => b.id === id ? { ...b, content } : b) })
    updateLearningBlock(id, content)
  }
  const directRemoveBlock = async (id: string) => {
    if (data === null || data === 'missing' || data === 'empty') return
    await deleteLearningBlock(id)
    setData({ ...data, blocks: data.blocks.filter(b => b.id !== id) })
  }
  const togglePublish = async () => {
    if (data === null || data === 'missing' || data === 'empty' || !data.page) return
    const next = data.page.status === 'draft' ? 'published' : 'draft'
    if (next === 'published' && !confirm('Publish this page so all users can read it?')) return
    await setPageStatus(data.page.id, next)
    setData({ ...data, page: { ...data.page, status: next } })
  }

  // ── Suggestion (local draft) mutations ──
  const draftAddBlock = (type: BlockType) => {
    setDraftBlocks(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        page_id: '',
        type,
        content: BLOCK_TEMPLATES[type],
        sort_order: prev.length + 1,
        isLocal: true,
      },
    ])
  }
  const draftEditBlock = (id: string, content: Record<string, unknown>) => {
    setDraftBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }
  const draftRemoveBlock = (id: string) => {
    setDraftBlocks(prev => prev.filter(b => b.id !== id))
  }

  // ── Submit a suggestion ──
  const submitSuggestion = async () => {
    if (data === null || data === 'missing' || data === 'empty') return
    setSubmitting(true)
    try {
      // Convert local drafts into the proposal payload. Local-only blocks omit `id`
      // (signaling "create"); kept blocks keep their `id` so the admin diff knows
      // they're updates of existing rows. Anything not in the list = delete.
      const payload: ProposedBlock[] = draftBlocks.map((b, i) => ({
        ...(b.isLocal ? {} : { id: b.id }),
        type: b.type,
        content: b.content,
        sort_order: i + 1,
      }))
      await submitLearningSuggestion(
        data.node.id,
        payload,
        suggestionMessage.trim() || null,
      )
      const fresh = await getMyPendingSuggestion(data.node.id)
      setPendingSuggestion(fresh)
      setEditMode('idle')
      setDraftBlocks([])
      setSuggestionMessage('')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelEdit = () => {
    setEditMode('idle')
    setShowInfoPanel(false)
    setDraftBlocks([])
    setSuggestionMessage('')
  }

  // ── Render states ──
  if (data === 'empty') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">No skills in your Learning column yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Move a skill into "Learning" from the Skills page to start.
          </p>
        </div>
      </div>
    )
  }

  if (data === null || !activeSkillId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
      </div>
    )
  }

  if (data === 'missing') {
    return (
      <div className="flex flex-1 items-center justify-center text-center">
        <p className="text-sm text-gray-400">Skill not found.</p>
      </div>
    )
  }

  // Which blocks the middle column should render. In suggestion mode we render
  // the local draft so the user sees their changes; otherwise the live blocks.
  const visibleBlocks: LearningBlock[] =
    editMode === 'suggestion' ? draftBlocks : data.blocks

  const editing = editMode !== 'idle'
  const status = data.page?.status

  return (
    <div className="flex min-h-full gap-6">
      {/* ═══ Middle column ═══ */}
      <div className="min-w-0 flex-1">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight text-black">
              {data.node.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status === 'draft' && (
                <span className="inline-block rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700">
                  Draft
                </span>
              )}
              {pendingSuggestion && editMode === 'idle' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  <Clock className="h-3 w-3" />
                  Your suggestion is awaiting review
                </span>
              )}
              {editMode === 'suggestion' && (
                <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Suggestion mode — your changes won't be live until an editor approves
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AddToLearnButton skillNodeId={data.node.id} />

            {editing && (
              <button
                onClick={() => setShowInfoPanel(v => !v)}
                title="Block types & SkillCoin rewards"
                className={`flex items-center justify-center rounded-xl border px-2.5 py-2 text-sm transition ${
                  showInfoPanel
                    ? 'border-amber-300 bg-amber-50 text-amber-600'
                    : 'border-gray-200 text-gray-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600'
                }`}
              >
                <Info className="h-4 w-4" />
              </button>
            )}

            {!editing && (
              <button
                onClick={enterEditMode}
                disabled={!isEditor && !!pendingSuggestion}
                title={!isEditor && pendingSuggestion ? 'You already have a pending suggestion for this skill' : undefined}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm transition hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}

            {editMode === 'direct' && (
              <>
                <button
                  onClick={togglePublish}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    status === 'published'
                      ? 'border border-gray-200 text-black hover:border-black'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  {status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => { setEditMode('idle'); setShowInfoPanel(false) }}
                  className="flex items-center gap-1.5 rounded-xl bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <Check className="h-4 w-4" /> Done
                </button>
              </>
            )}

            {editMode === 'suggestion' && (
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-black"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="mt-4 flex flex-col gap-3 pb-32">
          {visibleBlocks.length === 0 && !editing && (
            <p className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
              No content yet for this skill.
            </p>
          )}

          {editing
            ? visibleBlocks.map((b, i) => (
                <div key={b.id} className={b.type === 'heading' && i > 0 ? 'mt-5' : ''}>
                  <EditableBlockRow
                    block={b}
                    onChange={c => editMode === 'direct' ? directEditBlock(b.id, c) : draftEditBlock(b.id, c)}
                    onDelete={() => editMode === 'direct' ? directRemoveBlock(b.id) : draftRemoveBlock(b.id)}
                  />
                </div>
              ))
            : visibleBlocks.map((b, i) => (
                <div key={b.id} className={`px-4 ${b.type === 'heading' && i > 0 ? 'pt-7 pb-2' : 'py-2'}`}>
                  <LearningBlockRenderer block={b} />
                </div>
              ))
          }

          {editing && (
            <div className="mt-2">
              <AddBlockMenu onAdd={editMode === 'direct' ? directAddBlock : draftAddBlock} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right panel ═══ */}
      <LearnRightPanel
        blocks={visibleBlocks}
        skillNodeId={data.node.id}
        learningSkills={learningSkills}
        activeSkillId={activeSkillId}
        onSelectSkill={switchSkill}
      />

      {/* ═══ Edit info panel ═══ */}
      {showInfoPanel && editing && (
        <EditInfoPanel
          onClose={() => setShowInfoPanel(false)}
          isSuggestion={editMode === 'suggestion'}
        />
      )}

      {/* ═══ Suggestion submit bar (sticky bottom) ═══ */}
      {editMode === 'suggestion' && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[min(90%,42rem)] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Suggest an edit
          </p>
          <textarea
            value={suggestionMessage}
            onChange={e => setSuggestionMessage(e.target.value)}
            placeholder="Optional: tell the editor why this change matters."
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none transition focus:border-black focus:bg-white"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {draftBlocks.length} {draftBlocks.length === 1 ? 'block' : 'blocks'} in your proposal
            </p>
            <button
              onClick={submitSuggestion}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Sending…' : 'Submit suggestion'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
