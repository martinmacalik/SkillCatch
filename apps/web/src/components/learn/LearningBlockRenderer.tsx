import type { LearningBlock } from '@/lib/learn-queries'
import { HeadingBlock } from './blocks/HeadingBlock'
import { TextBlock } from './blocks/TextBlock'
import { CalloutBlock } from './blocks/CalloutBlock'
import { ResourceListBlock } from './blocks/ResourceListBlock'
import { FlashcardsBlock } from './blocks/FlashcardsBlock'
import { ChecklistBlock } from './blocks/ChecklistBlock'

export function LearningBlockRenderer({ block }: { block: LearningBlock }) {
  switch (block.type) {
    case 'heading':       return <HeadingBlock content={block.content} />
    case 'text':          return <TextBlock content={block.content} />
    case 'callout':       return <CalloutBlock content={block.content} />
    case 'resource_list': return <ResourceListBlock content={block.content} />
    case 'flashcards':    return <FlashcardsBlock content={block.content} />
    case 'checklist':     return <ChecklistBlock content={block.content} />
    default:              return null
  }
}
