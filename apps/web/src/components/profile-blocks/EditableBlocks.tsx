import { Fragment, useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { getEventCoordinates } from '@dnd-kit/utilities'
import {
  canJoinRow,
  createBlock,
  deleteBlock,
  flatten,
  moveBlock,
  saveLayout,
  toRows,
  updateBlockData,
  type Block,
  type BlockData,
  type BlockType,
  type DropTarget,
  type ProfileSkill,
} from '@/lib/profile-blocks'
import { BlocksContext } from './BlocksContext'
import { AddBlockMenu } from './AddBlockMenu'
import { blockDef, ROW_COLS } from './registry'

interface Props {
  userId: string
  blocks: Block[]
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>
  skills: Map<string, ProfileSkill>
  refreshSkills: () => void
  onError: (message: string) => void
}


// The overlay starts where the dragged block's top-left corner is, but the grip
// sits top-RIGHT → the label would trail far from the cursor. This modifier shifts
// it so the label's grip icon is right under the pointer the whole time.
const labelUnderCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const start = activatorEvent && getEventCoordinates(activatorEvent)
  if (!start || !draggingNodeRect) return transform
  return {
    ...transform,
    x: transform.x + start.x - draggingNodeRect.left - 18,
    y: transform.y + start.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  }
}
// Drop target ids: "gap:2" = new row before row 2, "beside:<blockId>:left"
const parseTarget = (id: string): DropTarget | null => {
  const [kind, a, b] = id.split(':')
  if (kind === 'gap') return { kind: 'gap', index: Number(a) }
  if (kind === 'beside') return { kind: 'beside', blockId: a, side: b as 'left' | 'right' }
  return null
}

export function EditableBlocks({ userId, blocks, setBlocks, skills, refreshSkills, onError }: Props) {
  const rows = useMemo(() => toRows(blocks), [blocks])
  const [dragging, setDragging] = useState<Block | null>(null)
  const [menu, setMenu] = useState<number | 'end' | null>(null) // which + menu is open (row index)
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null)

  // a few px of movement before a drag starts, so clicks on the handle still work
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const persistLayout = (next: Block[]) => {
    setBlocks(next)
    saveLayout(next).catch(() => onError('Could not save the layout. Reload the page.'))
  }

  const add = async (type: BlockType, rowIndex: number | 'end') => {
    // Stored indexes can have gaps (converted old cards), so use the real row_index
    // of the target row, or one past the last row; then renumber everything.
    const last = blocks.reduce((m, b) => Math.max(m, b.row_index), -1)
    const row = rowIndex === 'end' ? last + 1 : rows[rowIndex][0].row_index
    const col = rowIndex === 'end' ? 0 : rows[rowIndex].length
    try {
      const block = await createBlock(userId, type, row, col)
      persistLayout(flatten(toRows([...blocks, block])))
      setAutoFocusId(block.id)
    } catch {
      onError('Could not add the block.')
    }
  }

  const change = (block: Block, data: BlockData) => {
    // functional update: an image upload finishes later and must not undo newer edits
    setBlocks(prev => prev.map(b => (b.id === block.id ? { ...b, data } : b)))
    updateBlockData(block.id, data)
      .then(() => { if (block.type === 'skill_list' || block.type === 'skill_spotlight') refreshSkills() })
      .catch(() => onError('Could not save. Try again.'))
  }

  const remove = (block: Block) => {
    const next = flatten(rows.map(r => r.filter(b => b.id !== block.id)))
    deleteBlock(block)
      .then(() => persistLayout(next))
      .catch(() => onError('Could not delete the block.'))
  }

  const onDragStart = (e: DragStartEvent) => setDragging(blocks.find(b => b.id === e.active.id) ?? null)

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const target = e.over ? parseTarget(String(e.over.id)) : null
    if (!target) return
    const next = moveBlock(rows, String(e.active.id), target)
    if (next) persistLayout(flatten(next))
  }

  return (
    <BlocksContext.Provider value={{ editable: true, ownerId: userId, skills, autoFocusId }}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="flex flex-col">
          {rows.map((row, ri) => {
            // can another block still go into this row? (any type at all)
            const roomy = canJoinRow(row, 'text')
            return (
              <Fragment key={row[0].id}>
                <GapZone index={ri} active={!!dragging} />
                <div className="group/row relative">
                  <div className={`grid items-start gap-4 ${ROW_COLS[row.length]}`}>
                    {row.map(b => (
                      <EditableBlock
                        key={b.id}
                        block={b}
                        dragging={dragging}
                        // the row as it would be without the dragged block
                        rowWithoutDragged={row.filter(x => x.id !== dragging?.id)}
                        onChange={data => change(b, data)}
                        onDelete={() => remove(b)}
                      />
                    ))}
                  </div>

                  {/* + beside the row → a block into this row */}
                  {roomy && !dragging && (
                    <div className="absolute -right-10 top-0 hidden md:block">
                      <button
                        onClick={() => setMenu(ri)}
                        title="Add a block to this row"
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition hover:bg-gray-100 hover:text-gray-700 ${
                          menu === ri ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      {menu === ri && (
                        <AddBlockMenu
                          align="right"
                          allowed={type => canJoinRow(row, type)}
                          onPick={type => void add(type, ri)}
                          onClose={() => setMenu(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </Fragment>
            )
          })}
          <GapZone index={rows.length} active={!!dragging} />
        </div>

        <DragOverlay dropAnimation={null} modifiers={[labelUnderCursor]}>
          {dragging && <DragPreview block={dragging} />}
        </DragOverlay>
      </DndContext>

      {/* + below everything → a new row */}
      <div className="relative">
        <button
          onClick={() => setMenu('end')}
          title="Add a block"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <Plus className="h-4 w-4" />
          {rows.length === 0 && 'Add a block'}
        </button>
        {menu === 'end' && (
          <AddBlockMenu allowed={() => true} onPick={type => void add(type, 'end')} onClose={() => setMenu(null)} />
        )}
      </div>
    </BlocksContext.Provider>
  )
}

// ── one block with its hover toolbar and the left/right drop zones ──────────

function EditableBlock({ block, dragging, rowWithoutDragged, onChange, onDelete }: {
  block: Block
  dragging: Block | null
  rowWithoutDragged: Block[]
  onChange: (data: BlockData) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: block.id })
  const { Component } = blockDef(block.type)
  // dropping beside me is possible only if the dragged block fits into my row
  const canDropBeside = !!dragging && dragging.id !== block.id && canJoinRow(rowWithoutDragged, dragging.type)

  return (
    <div ref={setNodeRef} className={`group/block relative min-w-0 ${isDragging ? 'opacity-30' : ''}`}>
      <div className="absolute -top-3 right-2 z-20 flex gap-0.5 rounded-lg border border-gray-100 bg-white p-0.5 opacity-0 shadow-sm transition group-hover/block:opacity-100">
        <button
          {...listeners}
          {...attributes}
          title="Drag to move"
          className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          title="Delete block"
          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Component block={block} onChange={onChange} />

      {canDropBeside && (
        <>
          <BesideZone id={`beside:${block.id}:left`} side="left" />
          <BesideZone id={`beside:${block.id}:right`} side="right" />
        </>
      )}
    </div>
  )
}

// left/right half of a block; the blue line shows where the block would land
function BesideZone({ id, side }: { id: string; side: 'left' | 'right' }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`absolute inset-y-0 z-30 w-1/2 ${side === 'left' ? 'left-0' : 'right-0'}`}>
      {isOver && <div className={`absolute inset-y-0 w-1 rounded-full bg-indigo-500 ${side === 'left' ? '-left-2.5' : '-right-2.5'}`} />}
    </div>
  )
}

// space between rows (same 16 px as the gap on the public page); while dragging it's a drop zone
function GapZone({ index, active }: { index: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${index}`, disabled: !active })
  return (
    <div ref={setNodeRef} className="relative h-4">
      {active && <div className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition ${isOver ? 'bg-indigo-500' : 'bg-transparent'}`} />}
    </div>
  )
}

function DragPreview({ block }: { block: Block }) {
  const { icon: Icon, label } = blockDef(block.type)
  return (
    <div className="flex w-fit cursor-grabbing items-center gap-2 rounded-xl border border-gray-200 bg-white py-2 pl-1.5 pr-3 text-sm font-medium text-gray-700 shadow-xl">
      <GripVertical className="h-4 w-4 text-gray-300" />
      <Icon className="h-4 w-4 text-gray-400" /> {label}
    </div>
  )
}
