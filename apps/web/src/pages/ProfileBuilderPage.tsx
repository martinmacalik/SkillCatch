import { useEffect, useRef, useState } from 'react'
import { Plus, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { SortableCardList, type ProfileCard } from '@/components/profile-builder/SortableCardList'
import { CardEditorPanel } from '@/components/profile-builder/CardEditorPanel'

type CardType = ProfileCard['type']

const CARD_TYPE_OPTIONS: { type: CardType; label: string; description: string }[] = [
  { type: 'text',       label: 'Text',        description: 'A heading and body text block' },
  { type: 'text_photo', label: 'Text + Photo', description: 'Text alongside an image' },
  { type: 'photo',      label: 'Photo',        description: 'A full-width image with caption' },
  { type: 'skills',     label: 'Skills',       description: 'Showcase skills from your library' },
  { type: 'cv',         label: 'CV',           description: 'Upload your CV as a PDF' },
]

export default function ProfileBuilderPage() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [cards, setCards] = useState<ProfileCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [userSkills, setUserSkills] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedCard = cards.find(c => c.id === selectedId) ?? null

  useEffect(() => {
    if (!userId) return
    Promise.all([
      supabase
        .from('profile_cards')
        .select('*')
        .eq('user_id', userId)
        .order('position'),
      supabase
        .from('user_skills')
        .select('skill_node_id, skill_nodes(name)')
        .eq('user_id', userId),
    ]).then(([{ data: cardData }, { data: skillData }]) => {
      setCards((cardData ?? []) as ProfileCard[])
      setUserSkills(
        (skillData ?? []).map((s: { skill_node_id: string; skill_nodes: { name: string } | null }) => ({
          id: s.skill_node_id,
          name: s.skill_nodes?.name ?? '',
        }))
      )
      setLoading(false)
    })
  }, [userId])

  const addCard = async (type: CardType) => {
    setShowTypePicker(false)
    const position = cards.length + 1
    const { data, error } = await supabase
      .from('profile_cards')
      .insert({ user_id: userId, type, position, data: {} })
      .select()
      .single()
    if (!error && data) {
      const newCard = data as ProfileCard
      setCards(prev => [...prev, newCard])
      setSelectedId(newCard.id)
    }
  }

  const deleteCard = async (id: string) => {
    await supabase.from('profile_cards').delete().eq('id', id)
    setCards(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleReorder = async (reordered: ProfileCard[]) => {
    setCards(reordered)
    await supabase.rpc('reorder_profile_cards', {
      p_user_id: userId,
      p_ids: reordered.map(c => c.id),
    })
  }

  const handleCardDataChange = (data: Record<string, unknown>) => {
    setCards(prev => prev.map(c => c.id === selectedId ? { ...c, data } : c))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('profile_cards').update({ data }).eq('id', selectedId!)
    }, 500)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="mt-0.5 text-sm text-gray-400">Build how others see you on SkillCatch</p>
        </div>
        <a
          href={`/profile/${userId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          <ExternalLink className="h-4 w-4" />
          View public profile
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: card list */}
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Cards</p>
          {cards.length === 0 && (
            <div className="mb-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Add your first card below</p>
            </div>
          )}
          <SortableCardList
            cards={cards}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteCard}
            onReorder={handleReorder}
          />

          <div className="relative mt-3">
            <button
              onClick={() => setShowTypePicker(v => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-400 transition hover:border-indigo-500 hover:text-indigo-600"
            >
              <Plus className="h-4 w-4" />
              Add card
            </button>
            {showTypePicker && (
              <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl">
                {CARD_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => addCard(opt.type)}
                    className="flex w-full flex-col px-4 py-3 text-left transition hover:bg-indigo-50"
                  >
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    <span className="text-xs text-gray-400">{opt.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: editor */}
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Edit card</p>
          {selectedCard ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <CardEditorPanel
                card={selectedCard}
                userId={userId}
                onChange={handleCardDataChange}
                userSkills={userSkills}
              />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Select a card to edit it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
