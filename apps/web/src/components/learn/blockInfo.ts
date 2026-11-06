import { Heading, Type, Lightbulb, Link2, Layers, ListChecks } from 'lucide-react'

// SkillCoins per learning block: shown in EditInfoPanel, AddBlockMenu and on the Rewards page
export const BLOCK_INFO = [
  {
    type: 'heading',
    label: 'Heading',
    Icon: Heading,
    description: 'A section title that structures the page and appears in the nav outline.',
    coins: 5,
  },
  {
    type: 'text',
    label: 'Text',
    Icon: Type,
    description: 'A paragraph of body copy — explanations, context, or written content.',
    coins: 10,
  },
  {
    type: 'callout',
    label: 'Callout',
    Icon: Lightbulb,
    description: 'A highlighted tip, warning, or note that stands out from the main flow.',
    coins: 15,
  },
  {
    type: 'resource_list',
    label: 'Resources',
    Icon: Link2,
    description: 'A curated list of external links — articles, videos, docs, or tools.',
    coins: 20,
  },
  {
    type: 'checklist',
    label: 'Checklist',
    Icon: ListChecks,
    description: 'Step-by-step tasks or milestones learners can tick off as they progress.',
    coins: 25,
  },
  {
    type: 'flashcards',
    label: 'Flashcards',
    Icon: Layers,
    description: 'Front/back card pairs for active recall — the highest-effort block type.',
    coins: 35,
  },
]
