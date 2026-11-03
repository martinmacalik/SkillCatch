import { BLOCK_INFO } from '@/components/learn/EditInfoPanel'

// Reward rules shown on the Rewards page.
// XP = how much you learn (drives your level), SkillCoins = reward for contributing to the app.
// `live: false` → the rule is planned, the backend doesn't award it yet.

export interface RewardRule {
  label: string
  description: string
  xp?: number
  coins?: number | string // string for ranges like "5–35"
  live: boolean
}

export interface RewardGroup {
  title: string
  subtitle: string
  rules: RewardRule[]
}

const blockCoins = BLOCK_INFO.map(b => b.coins)

export const REWARD_GROUPS: RewardGroup[] = [
  {
    title: 'Learning',
    subtitle: 'Doing what the app is for earns XP',
    rules: [
      { label: 'Add a skill', description: 'Put a new skill on your list.', xp: 10, live: false },
      { label: 'Start learning a skill', description: 'Move a skill to the Learning stage.', xp: 20, live: false },
      { label: 'Level up a skill', description: 'Pass a level-up check on a skill.', xp: 50, live: false },
      { label: 'Finish a checklist', description: 'Tick off every item of a checklist block.', xp: 15, live: false },
      { label: 'Review flashcards', description: 'Go through a whole flashcard deck.', xp: 10, live: false },
    ],
  },
  {
    title: 'Consistency',
    subtitle: 'Showing up regularly',
    rules: [
      { label: 'Daily login', description: 'Open SkillCatch on a new day.', xp: 5, live: false },
      { label: '7-day streak', description: 'Log in seven days in a row.', xp: 50, coins: 10, live: false },
      { label: '30-day streak', description: 'Keep the streak going for a month.', xp: 200, coins: 50, live: false },
    ],
  },
  {
    title: 'Community',
    subtitle: 'Learning together',
    rules: [
      { label: 'Start a chat', description: 'Connect with another learner.', xp: 10, live: false },
      { label: 'Share a skill', description: 'Send a skill card to someone in chat.', xp: 5, live: false },
      { label: 'Complete your profile', description: 'Add a photo, bio and your profile cards.', xp: 30, coins: 20, live: false },
    ],
  },
  {
    title: 'Contributing',
    subtitle: 'Growing the app earns SkillCoins',
    rules: [
      {
        label: 'Add learning content',
        description: `Each block on a learning page, from ${BLOCK_INFO[0].label.toLowerCase()} to ${BLOCK_INFO[BLOCK_INFO.length - 1].label.toLowerCase()}.`,
        xp: 5,
        coins: `${Math.min(...blockCoins)}–${Math.max(...blockCoins)}`,
        live: false,
      },
      { label: 'Suggest a new skill', description: 'Paid out once an admin approves it.', xp: 10, coins: 25, live: false },
      { label: 'Improve the skill structure', description: 'Approved proposal from the structure builder.', coins: 10, live: true },
    ],
  },
]

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
