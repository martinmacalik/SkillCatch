import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LearningBlock, UserLearningSkill } from '@/lib/learn-queries'
import { NavigationWidget } from './NavigationWidget'
import { TeachersWidget } from './TeachersWidget'
import { LearningSkillsList } from './LearningSkillsList'

// Right-hand sidebar with two scenes:
//  - default: widget bar (Navigation TOC + Teachers)
//  - opened:  Learning column overlay sliding in from the right
//
// The widgets stay mounted under the overlay so opening/closing doesn't refetch.
export function LearnRightPanel({
  blocks,
  skillNodeId,
  learningSkills,
  activeSkillId,
  onSelectSkill,
}: {
  blocks: LearningBlock[]
  skillNodeId: string
  learningSkills: UserLearningSkill[]
  activeSkillId: string | null
  onSelectSkill: (skillNodeId: string) => void
}) {
  const [showLearningList, setShowLearningList] = useState(false)

  return (
    <aside className="relative w-72 shrink-0">
      {/* Toggle pinned to the panel's top-right corner. The arrow direction
          mirrors the action — closed = "open it" (left-arrow points into widgets),
          opened = "close it" (right-arrow points out). */}
      <button
        onClick={() => setShowLearningList(v => !v)}
        className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-black"
        aria-label={showLearningList ? 'Show widgets' : 'Show Learning column'}
      >
        {showLearningList
          ? <ChevronRight className="h-4 w-4" />
          : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Widget bar — always rendered, always fetching. */}
      <div className="flex flex-col gap-4">
        <NavigationWidget blocks={blocks} />
        <TeachersWidget skillNodeId={skillNodeId} />
      </div>

      {/* Learning-list overlay — absolutely positioned over the widgets,
          slid offscreen with translate-x when closed. */}
      <div
        className={`pointer-events-none absolute inset-0 transition-transform duration-300 ${
          showLearningList ? 'translate-x-0' : 'translate-x-[110%]'
        }`}
      >
        <div className={`pointer-events-auto h-full ${showLearningList ? '' : 'pointer-events-none'}`}>
          <LearningSkillsList
            skills={learningSkills}
            activeId={activeSkillId}
            onSelect={id => {
              onSelectSkill(id)
              setShowLearningList(false)
            }}
          />
        </div>
      </div>
    </aside>
  )
}
