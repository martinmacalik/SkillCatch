import { createContext, useContext } from 'react'
import type { Block, BlockData, ProfileSkill } from '@/lib/profile-blocks'

// What every block needs besides its own data. The same block components
// render in the editor (editable) and on the public profile (read-only).
export interface BlocksContextValue {
  editable: boolean
  ownerId: string
  skills: Map<string, ProfileSkill> // live data of the skills in skill blocks
  // visitor: which skills I already have + open the "add skill" modal
  mySkillIds?: Set<string>
  onAddSkill?: (skillId: string) => void
  // editor: a freshly added block grabs focus
  autoFocusId?: string | null
}

export const BlocksContext = createContext<BlocksContextValue | null>(null)

export function useBlocks(): BlocksContextValue {
  const ctx = useContext(BlocksContext)
  if (!ctx) throw new Error('useBlocks outside BlocksContext')
  return ctx
}

export interface BlockProps {
  block: Block
  onChange: (data: BlockData) => void // editor only; never called read-only
}
