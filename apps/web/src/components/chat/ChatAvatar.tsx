import { Users } from 'lucide-react'
import { groupAvatarUrl, type ChatProfile, type ConversationSummary } from '@/lib/chat-queries'

export function ChatAvatar({ profile, className = 'h-11 w-11' }: { profile: ChatProfile | null; className?: string }) {
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${className} shrink-0 rounded-full bg-linear-to-br from-pink-300 to-rose-400`} />
  )
}

// 1:1 → the other person's avatar, group → its photo, or a people icon
export function ConversationAvatar({
  conversation, className = 'h-11 w-11',
}: { conversation: ConversationSummary; className?: string }) {
  if (conversation.type === 'direct') return <ChatAvatar profile={conversation.other} className={className} />
  if (conversation.avatarPath) {
    return (
      <img
        src={groupAvatarUrl(conversation.avatarPath)}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-400 to-fuchsia-500 text-white`}>
      <Users className="h-1/2 w-1/2" />
    </div>
  )
}
