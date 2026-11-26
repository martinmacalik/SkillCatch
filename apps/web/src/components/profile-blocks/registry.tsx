import { Image as ImageIcon, LayoutList, Link2, Star, Type, type LucideIcon } from 'lucide-react'
import type { BlockType } from '@/lib/profile-blocks'
import type { BlockProps } from './BlocksContext'
import { TextBlock } from './blocks/TextBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { EmbedBlock } from './blocks/EmbedBlock'
import { SkillListBlock } from './blocks/SkillListBlock'
import { SkillSpotlightBlock } from './blocks/SkillSpotlightBlock'

// One place that knows every block type: the + menu and both grids read it.
export const BLOCK_TYPES: {
  type: BlockType
  label: string
  description: string
  icon: LucideIcon
  Component: (props: BlockProps) => React.ReactNode
}[] = [
  { type: 'text', label: 'Text', description: 'Heading and a paragraph', icon: Type, Component: TextBlock },
  { type: 'image', label: 'Image', description: 'A photo with a caption', icon: ImageIcon, Component: ImageBlock },
  { type: 'embed', label: 'Embed', description: 'YouTube video or a link', icon: Link2, Component: EmbedBlock },
  { type: 'skill_list', label: 'Skill list', description: 'Pick skills to show', icon: LayoutList, Component: SkillListBlock },
  { type: 'skill_spotlight', label: 'Skill spotlight', description: 'One skill with live progress', icon: Star, Component: SkillSpotlightBlock },
]

export const blockDef = (type: BlockType) => BLOCK_TYPES.find(d => d.type === type)!

// Tailwind needs whole class names in the source, so no `md:grid-cols-${n}`
export const ROW_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
}
