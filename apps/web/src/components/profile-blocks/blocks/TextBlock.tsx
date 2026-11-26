import { useEffect, useRef, useState } from 'react'
import { TEXT_BODY_MAX, TEXT_HEADING_MAX } from '@/lib/profile-blocks'
import { useBlocks, type BlockProps } from '../BlocksContext'

// Heading (optional) + paragraph. Edited in place, saved on blur — same as name/bio.
export function TextBlock({ block, onChange }: BlockProps) {
  const { editable, autoFocusId } = useBlocks()
  const [heading, setHeading] = useState(block.data.heading ?? '')
  const [body, setBody] = useState(block.data.body ?? '')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocusId === block.id) bodyRef.current?.focus()
  }, [autoFocusId, block.id])

  if (!editable) {
    return (
      <div>
        {block.data.heading && <h2 className="mb-1 text-xl font-semibold text-gray-900">{block.data.heading}</h2>}
        {block.data.body && <p className="whitespace-pre-wrap leading-relaxed text-gray-600">{block.data.body}</p>}
      </div>
    )
  }

  const save = () => {
    const next = { heading: heading.trim() || undefined, body: body.trim() || undefined }
    if (next.heading !== block.data.heading || next.body !== block.data.body) onChange(next)
  }

  return (
    <div>
      <input
        value={heading}
        onChange={e => setHeading(e.target.value.slice(0, TEXT_HEADING_MAX))}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') bodyRef.current?.focus() }}
        placeholder="Heading"
        className="mb-1 w-full bg-transparent text-xl font-semibold text-gray-900 outline-none placeholder:text-gray-300"
      />
      <textarea
        ref={bodyRef}
        value={body}
        onChange={e => setBody(e.target.value.slice(0, TEXT_BODY_MAX))}
        onBlur={save}
        placeholder="Write something…"
        rows={1}
        className="field-sizing-content w-full resize-none bg-transparent leading-relaxed text-gray-600 outline-none placeholder:text-gray-300"
      />
    </div>
  )
}
