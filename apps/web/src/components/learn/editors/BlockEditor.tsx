import type { BlockType } from '@/lib/learn-queries'
import type { EditorProps } from './types'
import { HeadingEditor } from './HeadingEditor'
import { TextEditor } from './TextEditor'
import { CalloutEditor } from './CalloutEditor'
import { ResourceListEditor } from './ResourceListEditor'
import { ChecklistEditor } from './ChecklistEditor'
import { FlashcardsEditor } from './FlashcardsEditor'

const EDITORS: Record<BlockType, (p: EditorProps) => React.ReactElement> = {
  heading: HeadingEditor,
  text: TextEditor,
  callout: CalloutEditor,
  resource_list: ResourceListEditor,
  checklist: ChecklistEditor,
  flashcards: FlashcardsEditor,
}

/** The inline editor for one Learn block (reading uses LearningBlockRenderer). */
export function BlockEditor({ type, ...props }: EditorProps & { type: BlockType }) {
  const Editor = EDITORS[type]
  return Editor ? <Editor {...props} /> : null
}
