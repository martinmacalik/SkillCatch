import { useMemo } from 'react'
import { isVisible, toRows, type Block, type ProfileSkill } from '@/lib/profile-blocks'
import { BlocksContext } from './BlocksContext'
import { blockDef, ROW_COLS } from './registry'

interface Props {
  ownerId: string
  blocks: Block[]
  skills: Map<string, ProfileSkill>
  mySkillIds?: Set<string>
  onAddSkill?: (skillId: string) => void
}

// Public profile: same rows and components as the editor, minus empty blocks.
export function ReadOnlyBlocks({ ownerId, blocks, skills, mySkillIds, onAddSkill }: Props) {
  const rows = useMemo(() => toRows(blocks.filter(b => isVisible(b, skills))), [blocks, skills])
  if (rows.length === 0) return null

  return (
    <BlocksContext.Provider value={{ editable: false, ownerId, skills, mySkillIds, onAddSkill }}>
      <div className="flex flex-col gap-4">
        {rows.map(row => (
          <div key={row[0].id} className={`grid items-start gap-4 ${ROW_COLS[row.length]}`}>
            {row.map(b => {
              const { Component } = blockDef(b.type)
              return <Component key={b.id} block={b} onChange={() => {}} />
            })}
          </div>
        ))}
      </div>
    </BlocksContext.Provider>
  )
}
