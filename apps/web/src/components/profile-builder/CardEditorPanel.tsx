import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { ProfileCard } from './SortableCardList'

async function uploadFile(userId: string, cardId: string, file: File): Promise<string> {
  const path = `${userId}/${cardId}/${file.name}`
  await supabase.storage.from('profile-media').upload(path, file, { upsert: true })
  return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl
}

function FileUploadButton({ accept, label, onUpload }: {
  accept: string
  label: string
  onUpload: (file: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]) }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 transition hover:border-indigo-400 hover:text-indigo-500"
      >
        <Upload className="h-4 w-4" />
        {label}
      </button>
    </>
  )
}

interface Props {
  card: ProfileCard
  userId: string
  onChange: (data: Record<string, unknown>) => void
  userSkills: { id: string; name: string }[]
}

export function CardEditorPanel({ card, userId, onChange, userSkills }: Props) {
  const d = card.data

  if (card.type === 'text') {
    return (
      <div className="flex flex-col gap-3">
        <input
          value={(d.heading as string) ?? ''}
          onChange={e => onChange({ ...d, heading: e.target.value })}
          placeholder="Heading (optional)"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <textarea
          value={(d.body as string) ?? ''}
          onChange={e => onChange({ ...d, body: e.target.value })}
          placeholder="Body text…"
          rows={5}
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
    )
  }

  if (card.type === 'text_photo') {
    return (
      <div className="flex flex-col gap-3">
        <input
          value={(d.heading as string) ?? ''}
          onChange={e => onChange({ ...d, heading: e.target.value })}
          placeholder="Heading (optional)"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <textarea
          value={(d.body as string) ?? ''}
          onChange={e => onChange({ ...d, body: e.target.value })}
          placeholder="Body text…"
          rows={4}
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        {d.photo_url && (
          <img src={d.photo_url as string} alt="" className="h-32 w-full rounded-xl object-cover" />
        )}
        <FileUploadButton
          accept="image/jpeg,image/png,image/webp"
          label={d.photo_url ? 'Replace photo' : 'Upload photo'}
          onUpload={async file => {
            const url = await uploadFile(userId, card.id, file)
            onChange({ ...d, photo_url: url })
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...d, photo_position: 'left' })}
            className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
              (d.photo_position ?? 'left') === 'left'
                ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            Photo left
          </button>
          <button
            onClick={() => onChange({ ...d, photo_position: 'right' })}
            className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
              d.photo_position === 'right'
                ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            Photo right
          </button>
        </div>
      </div>
    )
  }

  if (card.type === 'photo') {
    return (
      <div className="flex flex-col gap-3">
        {d.url && (
          <img src={d.url as string} alt="" className="h-48 w-full rounded-xl object-cover" />
        )}
        <FileUploadButton
          accept="image/jpeg,image/png,image/webp"
          label={d.url ? 'Replace photo' : 'Upload photo'}
          onUpload={async file => {
            const url = await uploadFile(userId, card.id, file)
            onChange({ ...d, url })
          }}
        />
        <input
          value={(d.caption as string) ?? ''}
          onChange={e => onChange({ ...d, caption: e.target.value })}
          placeholder="Caption (optional)"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
    )
  }

  if (card.type === 'skills') {
    const selected = (d.skill_ids as string[]) ?? []
    const toggle = (id: string) => {
      const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
      onChange({ ...d, skill_ids: next })
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-gray-400">Pick skills from your library to showcase</p>
        <div className="flex flex-wrap gap-2">
          {userSkills.map(s => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                selected.includes(s.id)
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {s.name}
            </button>
          ))}
          {userSkills.length === 0 && (
            <p className="text-sm text-gray-400">No skills in your library yet.</p>
          )}
        </div>
      </div>
    )
  }

  if (card.type === 'cv') {
    return (
      <div className="flex flex-col gap-3">
        {d.filename && (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="flex-1 truncate text-sm text-gray-700">{d.filename as string}</span>
            <a
              href={d.file_url as string}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-indigo-500 hover:underline"
            >
              View
            </a>
          </div>
        )}
        <FileUploadButton
          accept="application/pdf"
          label={d.filename ? 'Replace CV (PDF)' : 'Upload CV (PDF)'}
          onUpload={async file => {
            const url = await uploadFile(userId, card.id, file)
            onChange({ ...d, file_url: url, filename: file.name })
          }}
        />
      </div>
    )
  }

  return null
}
