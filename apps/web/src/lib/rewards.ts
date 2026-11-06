import { BLOCK_INFO } from '@/components/learn/blockInfo'

// Reward rules shown on the Rewards page.
// XP = how much you learn (drives your level), SkillCoins = reward for contributing to the app.
// Coins only for contributions an admin/editor approves; XP for a concrete thing count once (see award_xp).
// `live: false` → the rule is planned, the backend doesn't award it yet.

export type RewardId =
  | 'add_skill' | 'start_learning' | 'level_up' | 'finish_checklist' | 'review_flashcards'
  | 'daily_login' | 'streak_7' | 'streak_30'
  | 'start_chat' | 'share_skill' | 'complete_profile'
  | 'add_content' | 'suggest_skill' | 'improve_structure'

export interface RewardRule {
  id: RewardId
  label: string
  description: string
  xp?: number
  coins?: number | string // string for ranges like "5–35"
  live: boolean
  // where in the app you do it (state is read by the target page, e.g. to open a modal)
  action?: { label: string; to: string; state?: Record<string, unknown> }
}

export interface RewardGroup {
  title: string
  rules: RewardRule[]
}

const blockCoins = BLOCK_INFO.map(b => b.coins)

export const REWARD_GROUPS: RewardGroup[] = [
  {
    title: 'Learning',
    rules: [
      { id: 'add_skill', label: 'Add a skill', description: 'Put a new skill on your list.', xp: 10, live: false, action: { label: 'Add skill', to: '/dashboard/skills', state: { openAdd: true } } },
      { id: 'start_learning', label: 'Start learning a skill', description: 'Move a skill to the Learning stage.', xp: 20, live: false, action: { label: 'My skills', to: '/dashboard/skills' } },
      { id: 'level_up', label: 'Level up a skill', description: 'Pass a level-up check on a skill.', xp: 50, live: false, action: { label: 'Learn', to: '/dashboard/learn' } },
      { id: 'finish_checklist', label: 'Finish a checklist', description: 'Tick off every item of a checklist block.', xp: 15, live: false, action: { label: 'Learn', to: '/dashboard/learn' } },
      { id: 'review_flashcards', label: 'Review flashcards', description: 'Go through a whole flashcard deck.', xp: 10, live: false, action: { label: 'Learn', to: '/dashboard/learn' } },
    ],
  },
  {
    title: 'Consistency',
    rules: [
      { id: 'daily_login', label: 'Daily login', description: 'Open SkillCatch on a new day.', xp: 5, live: false },
      { id: 'streak_7', label: '7-day streak', description: 'Log in seven days in a row.', xp: 80, live: false },
      { id: 'streak_30', label: '30-day streak', description: 'Keep the streak going for a month.', xp: 300, live: false },
    ],
  },
  {
    title: 'Community',
    rules: [
      { id: 'start_chat', label: 'Start a chat', description: 'Connect with another learner.', xp: 10, live: false, action: { label: 'New chat', to: '/dashboard/chats', state: { newChat: true } } },
      { id: 'share_skill', label: 'Share a skill', description: 'Send a skill card to someone in chat.', xp: 5, live: false, action: { label: 'Chats', to: '/dashboard/chats' } },
      { id: 'complete_profile', label: 'Complete your profile', description: 'Add a photo, bio and your profile cards.', xp: 50, live: false, action: { label: 'Edit profile', to: '/dashboard/profile-builder' } },
    ],
  },
  {
    title: 'Contributing',
    rules: [
      {
        id: 'add_content',
        label: 'Add learning content',
        description: `Each block in a learning page suggestion, from ${BLOCK_INFO[0].label.toLowerCase()} to ${BLOCK_INFO[BLOCK_INFO.length - 1].label.toLowerCase()}. Paid out once an editor approves it.`,
        xp: 5,
        coins: `${Math.min(...blockCoins)}–${Math.max(...blockCoins)}`,
        live: false,
        action: { label: 'Learn', to: '/dashboard/learn' },
      },
      { id: 'suggest_skill', label: 'Suggest a new skill', description: 'A skill that doesn\'t exist yet. Paid out once an admin approves it.', xp: 10, coins: 25, live: false, action: { label: 'Suggest skill', to: '/dashboard/skills', state: { createSkill: true } } },
      { id: 'improve_structure', label: 'Improve the skill structure', description: 'Approved proposal from the structure builder.', coins: 10, live: true, action: { label: 'Open builder', to: '/dashboard/skill-feedback' } },
    ],
  },
]

// One rule by id, for the reward hints shown next to each action in the app
export function rewardRule(id: RewardId): RewardRule {
  return REWARD_GROUPS.flatMap(g => g.rules).find(r => r.id === id)!
}

// Level n starts at LEVEL_XP[n - 1] XP. Past the table, every level costs the last step again.
export const LEVEL_XP = [0, 100, 250, 500, 1000, 2000, 3500, 5000]

export function levelFor(xp: number) {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return { level, from: xpForLevel(level), to: xpForLevel(level + 1) }
}

export function xpForLevel(level: number): number {
  if (level <= LEVEL_XP.length) return LEVEL_XP[level - 1]
  const lastStep = LEVEL_XP[LEVEL_XP.length - 1] - LEVEL_XP[LEVEL_XP.length - 2]
  return LEVEL_XP[LEVEL_XP.length - 1] + (level - LEVEL_XP.length) * lastStep
}
