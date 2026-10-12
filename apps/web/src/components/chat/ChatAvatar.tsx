import type { ChatProfile } from '@/lib/chat-queries'

export function ChatAvatar({ profile, className = 'h-11 w-11' }: { profile: ChatProfile | null; className?: string }) {
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${className} shrink-0 rounded-full bg-linear-to-br from-pink-300 to-rose-400`} />
  )
}
