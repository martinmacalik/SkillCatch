import { GripVertical, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LearningBlock } from '@/lib/learn-queries'
import { BlockEditor } from './editors/BlockEditor'

/**
 * A block in edit mode: the inline editor (looks close to the reading view)
 * + grip ⋮⋮ (drag to reorder) and trash on hover. Used for direct edits and
 * suggestions alike — the parent decides where onChange goes.
 */
export function EditableBlockRow({
  block,
  onChange,
  onDelete,
  autoFocus,
}: {
  block: LearningBlock
  onChange: (content: Record<string, unknown>) => void
  onDelete: () => void
  autoFocus?: boolean
}) {
  // the sortable item moves with `transform` while dragging; the others make room
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative rounded-2xl px-4 py-3 transition-colors hover:bg-gray-50 ${
        isDragging ? 'z-10 bg-white opacity-80 shadow-xl' : ''
      }`}
    >
      {/* grip sits in the left gutter, trash on the right */}
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        title="Drag to reorder"
        className="absolute -left-7 top-3 flex h-7 w-6 cursor-grab items-center justify-center rounded-md text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={onDelete}
        title="Delete block"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-400 opacity-0 shadow-sm transition hover:text-pink-600 group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="pr-8">
        <BlockEditor type={block.type} content={block.content} onChange={onChange} autoFocus={autoFocus} />
      </div>
    </div>
  )
}
