import {
  Bell,
  BookOpen,
  Coins,
  Compass,
  FilePen,
  GitBranch,
  GraduationCap,
  HelpCircle,
  Home,
  Image,
  Languages,
  LogOut,
  Mail,
  MapPin,
  MessageCirclePlus,
  MessageSquare,
  Palette,
  Plus,
  Puzzle,
  Settings,
  ShieldAlert,
  Sparkles,
  Trophy,
  User,
  UserPen,
  type LucideIcon,
} from 'lucide-react'

import { REWARD_GROUPS } from '@/lib/rewards'

/*
 * Things the global search finds without asking the database:
 * actions, pages, single settings and help topics.
 * `focus` = element id on the target page to scroll to and flash (useSearchFocus).
 */

export type StaticCategory = 'actions' | 'pages' | 'settings' | 'help'

export type StaticRun =
  | { kind: 'go'; to: string; state?: Record<string, unknown> }
  | { kind: 'logout' }

export interface StaticEntry {
  id: string
  category: StaticCategory
  title: string
  subtitle?: string
  /** Extra words people may type ("photo" for Avatar…). */
  keywords?: string
  icon: LucideIcon
  run: StaticRun
}

const go = (to: string, state?: Record<string, unknown>): StaticRun => ({ kind: 'go', to, state })

const ACTIONS: StaticEntry[] = [
  { id: 'a-add-skill', category: 'actions', title: 'Add skill', subtitle: 'Find a skill and put it on your list', keywords: 'new skill browse', icon: Plus, run: go('/dashboard/skills', { openAdd: true }) },
  { id: 'a-new-chat', category: 'actions', title: 'New chat', subtitle: 'Message someone', keywords: 'message write start chat', icon: MessageCirclePlus, run: go('/dashboard/chats', { newChat: true }) },
  { id: 'a-edit-profile', category: 'actions', title: 'Edit profile', subtitle: 'Profile builder', keywords: 'profile cards bio public', icon: UserPen, run: go('/dashboard/profile-builder') },
  { id: 'a-edit-license', category: 'actions', title: 'Edit teaching license', subtitle: 'Teach', keywords: 'license teacher proof certificate', icon: FilePen, run: go('/dashboard/teach') },
  { id: 'a-time-tracker', category: 'actions', title: 'Track learning time', subtitle: 'Time Tracker on the dashboard', keywords: 'timer stopwatch start time tracker', icon: Sparkles, run: go('/dashboard') },
  { id: 'a-feedback', category: 'actions', title: 'Suggest a skill structure change', subtitle: 'Structure builder', keywords: 'feedback tree restructure proposal', icon: GitBranch, run: go('/dashboard/skill-feedback') },
  { id: 'a-logout', category: 'actions', title: 'Log out', keywords: 'sign out logout', icon: LogOut, run: { kind: 'logout' } },
]

const PAGES: StaticEntry[] = [
  { id: 'p-dashboard', category: 'pages', title: 'Dashboard', keywords: 'home overview', icon: Home, run: go('/dashboard') },
  { id: 'p-skills', category: 'pages', title: 'Skills', subtitle: 'Your skills overview', keywords: 'my skills', icon: Puzzle, run: go('/dashboard/skills') },
  { id: 'p-learn', category: 'pages', title: 'Learn', subtitle: 'Learning pages of your skills', keywords: 'course lessons', icon: BookOpen, run: go('/dashboard/learn') },
  { id: 'p-chats', category: 'pages', title: 'Chats', keywords: 'messages inbox', icon: MessageSquare, run: go('/dashboard/chats') },
  { id: 'p-discover', category: 'pages', title: 'Discover', subtitle: 'Find people', keywords: 'people users', icon: Compass, run: go('/dashboard/discover') },
  { id: 'p-teach', category: 'pages', title: 'Teach', subtitle: 'License, students, materials', keywords: 'teacher students', icon: GraduationCap, run: go('/dashboard/teach') },
  { id: 'p-rewards', category: 'pages', title: 'Rewards', subtitle: 'XP, levels and SkillCoins', keywords: 'xp level coins skillcoins', icon: Trophy, run: go('/dashboard/rewards') },
  { id: 'p-settings', category: 'pages', title: 'Settings', keywords: 'account preferences', icon: Settings, run: go('/dashboard/settings') },
  { id: 'p-help', category: 'pages', title: 'Help', keywords: 'support faq', icon: HelpCircle, run: go('/dashboard/help') },
]

const setting = (id: string, title: string, section: 'identity' | 'account' | 'preferences', icon: LucideIcon, keywords = ''): StaticEntry => ({
  id: `s-${id}`,
  category: 'settings',
  title,
  subtitle: `Settings · ${section[0].toUpperCase()}${section.slice(1)}`,
  keywords,
  icon,
  run: go('/dashboard/settings', { focus: `settings-${section}` }),
})

const SETTINGS: StaticEntry[] = [
  setting('photo', 'Profile photo', 'identity', Image, 'avatar picture image upload'),
  setting('name', 'Name', 'identity', User, 'first name last name surname'),
  setting('username', 'Username', 'identity', User, 'handle nickname @'),
  setting('bio', 'Bio', 'identity', User, 'about me description'),
  setting('location', 'Country and city', 'identity', MapPin, 'location town'),
  setting('language', 'Primary language', 'identity', Languages, 'language'),
  setting('email', 'Email', 'account', Mail, 'e-mail address'),
  setting('signin', 'Sign-in method', 'account', Mail, 'login google password'),
  setting('delete', 'Delete account', 'account', ShieldAlert, 'remove account danger zone'),
  setting('theme', 'Theme', 'preferences', Palette, 'dark mode light mode appearance'),
  setting('notifications', 'Email notifications', 'preferences', Bell, 'weekly digest answers proposals notifications'),
]

const HELP: StaticEntry[] = [
  { id: 'h-about', category: 'help', title: 'About SkillCatch', subtitle: 'How the app works', keywords: 'how it works guide', icon: BookOpen, run: go('/dashboard/help', { focus: 'help-about' }) },
  { id: 'h-contact', category: 'help', title: 'Get help', subtitle: 'Send us a message', keywords: 'contact support problem bug question', icon: HelpCircle, run: go('/dashboard/help', { focus: 'help-contact' }) },
  { id: 'h-coins', category: 'help', title: 'Skillcoins', subtitle: 'Your learning currency', keywords: 'coins currency', icon: Coins, run: go('/dashboard/help', { focus: 'help-coins' }) },
  { id: 'h-structure', category: 'help', title: 'Skill structure feedback', subtitle: 'Suggest changes to the skill tree', keywords: 'feedback tree', icon: GitBranch, run: go('/dashboard/help', { focus: 'help-structure' }) },
  // every reward rule: "how do I get XP for …"
  ...REWARD_GROUPS.flatMap((g) =>
    g.rules.map<StaticEntry>((r) => ({
      id: `h-reward-${r.id}`,
      category: 'help',
      title: r.label,
      subtitle: `Rewards · ${[r.xp != null && `+${r.xp} XP`, r.coins != null && `${r.coins} coins`].filter(Boolean).join(' · ') || g.title}`,
      keywords: `${r.description} reward xp coins earn`,
      icon: Trophy,
      run: go('/dashboard/rewards'),
    })),
  ),
]

export const STATIC_ENTRIES: StaticEntry[] = [...ACTIONS, ...PAGES, ...SETTINGS, ...HELP]
