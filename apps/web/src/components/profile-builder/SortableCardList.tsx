import { GripVertical, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface ProfileCard {
  id: string
  position: number
  type: 'text' | 'text_photo' | 'photo' | 'skills' | 'cv'
  data: Record<string, unknown>
}

const TYPE_LABELS: Record<ProfileCard['type'], string> = {
  text: 'Text',
  text_photo: 'Text + Photo',
  photo: 'Photo',
  skills: 'Skills',
  cv: 'CV',
}

function SortableCardItem({
  card,
  selected,
  onSelect,
  onDelete,
}: {
  card: ProfileCard
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
        selected
          ? 'border-indigo-300 bg-indigo-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium text-gray-700">
        {TYPE_LABELS[card.type]}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="text-gray-300 hover:text-rose-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function SortableCardList({
  cards,
  selectedId,
  onSelect,
  onDelete,
  onReorder,
}: {
  cards: ProfileCard[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (cards: ProfileCard[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = cards.findIndex(c => c.id === active.id)
    const newIndex = cards.findIndex(c => c.id === over.id)
    onReorder(arrayMove(cards, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {cards.map(card => (
            <SortableCardItem
              key={card.id}
              card={card}
              selected={card.id === selectedId}
              onSelect={() => onSelect(card.id)}
              onDelete={() => onDelete(card.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
