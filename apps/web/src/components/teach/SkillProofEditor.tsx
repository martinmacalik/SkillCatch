import { useState, type SyntheticEvent } from 'react'
import { AlertTriangle, FileText, Film, Link2, Paperclip, Plus, Trash2, X } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  EVIDENCE_TYPE_LABELS,
  LEVEL_LABELS,
  type EvidenceType,
  type LicenseEvidence,
  type LicenseSkill,
  type TeachingLevel,
} from '@/types/teaching'
import { EVIDENCE_ACCEPT, evidenceKindFromFile, formatDate, newId, normalizeLink, nowIso } from './teach-utils'

const LEVELS: TeachingLevel[] = ['intermediate', 'advanced', 'expert']
const EVIDENCE_TYPES: EvidenceType[] = ['certificate', 'competition', 'home_showcase']

interface SkillProofEditorProps {
  skill: LicenseSkill
  onChange: (skill: LicenseSkill) => void
  onRemove: () => void
  createPreviewUrl: (file: File) => string
  releasePreviewUrl: (url: string | null) => void
}

/** One skill on the license: its level and the list of proofs. */
export function SkillProofEditor({ skill, onChange, onRemove, createPreviewUrl, releasePreviewUrl }: SkillProofEditorProps) {
  const [adding, setAdding] = useState(false)

  const removeEvidence = (ev: LicenseEvidence) => {
    if (ev.kind !== 'link') releasePreviewUrl(ev.url)
    onChange({ ...skill, evidence: skill.evidence.filter((e) => e.id !== ev.id) })
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      {/* ── header: name, level, remove ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-gray-900">{skill.skillName}</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label={`${skill.skillName} level`}>
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={skill.level === level}
                onClick={() => onChange({ ...skill, level })}
                className={cn(
                  'cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                  skill.level === level ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${skill.skillName}`}
            className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── proofs ── */}
      <p className="mt-4 text-xs font-semibold tracking-widest text-gray-400 uppercase">Proof</p>

      {skill.evidence.length === 0 && !adding && (
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Add at least one proof to submit this skill for review.
        </p>
      )}

      {skill.evidence.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {skill.evidence.map((ev) => (
            <EvidenceRow key={ev.id} evidence={ev} onRemove={() => removeEvidence(ev)} />
          ))}
        </ul>
      )}

      {adding ? (
        <AddEvidenceForm
          licenseSkillId={skill.id}
          createPreviewUrl={createPreviewUrl}
          onAdd={(ev) => {
            onChange({ ...skill, evidence: [...skill.evidence, ev] })
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-50"
        >
          <Plus className="h-4 w-4" />
          Add proof
        </button>
      )}
    </div>
  )
}

/* ── list item ── */

function EvidenceRow({ evidence, onRemove }: { evidence: LicenseEvidence; onRemove: () => void }) {
  const source = evidence.kind === 'link' ? hostOf(evidence.url) : evidence.fileName
  const date = formatDate(evidence.date)

  return (
    <li className="flex items-center gap-3 rounded-xl bg-gray-50 p-2 pr-3">
      <EvidenceThumb evidence={evidence} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
            {EVIDENCE_TYPE_LABELS[evidence.type]}
          </span>
          {date && <span className="text-xs text-gray-400">{date}</span>}
        </div>
        {evidence.description && <p className="mt-0.5 truncate text-sm text-gray-800">{evidence.description}</p>}
        {source &&
          (evidence.kind === 'link' ? (
            <a href={evidence.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-gray-400 hover:text-purple-700">
              {source}
            </a>
          ) : (
            <p className="truncate text-xs text-gray-400">{source}</p>
          ))}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove proof"
        className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )
}

function EvidenceThumb({ evidence }: { evidence: LicenseEvidence }) {
  const box = 'h-12 w-12 shrink-0 rounded-lg'
  if (evidence.kind === 'image') return <img src={evidence.url} alt="" className={cn(box, 'object-cover')} />

  const Icon = evidence.kind === 'video' ? Film : evidence.kind === 'pdf' ? FileText : Link2
  return (
    <div className={cn(box, 'flex items-center justify-center bg-white text-purple-700 ring-1 ring-gray-200')}>
      <Icon className="h-5 w-5" />
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* ── add form ── */

interface AddEvidenceFormProps {
  licenseSkillId: string
  createPreviewUrl: (file: File) => string
  onAdd: (evidence: LicenseEvidence) => void
  onCancel: () => void
}

function AddEvidenceForm({ licenseSkillId, createPreviewUrl, onAdd, onCancel }: AddEvidenceFormProps) {
  const [source, setSource] = useState<'file' | 'link'>('file')
  // The file waits here; its object URL is created only on "Add", so an
  // abandoned pick never leaves a blob behind.
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [type, setType] = useState<EvidenceType>('certificate')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: SyntheticEvent) => {
    e.preventDefault()
    const base = {
      id: newId(),
      licenseSkillId,
      type,
      description: description.trim(),
      date: date || null,
      createdAt: nowIso(),
    }

    if (source === 'file') {
      const kind = file ? evidenceKindFromFile(file) : null
      if (!file || !kind) {
        setError('Pick a photo, video or PDF.')
        return
      }
      onAdd({ ...base, kind, url: createPreviewUrl(file), path: null, fileName: file.name, file })
    } else {
      const url = normalizeLink(link)
      if (!url) {
        setError('Enter a valid link (http or https).')
        return
      }
      onAdd({ ...base, kind: 'link', url, path: null, fileName: null, file: null })
    }
  }

  // Nested inside the license form, so this is a <div> handling Enter itself, not a <form>.
  return (
    <div
      className="mt-3 flex flex-col gap-3 rounded-xl bg-gray-50 p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) submit(e)
      }}
    >
      {/* source toggle */}
      <div className="flex w-fit rounded-xl bg-white p-1 ring-1 ring-gray-200">
        {(['file', 'link'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSource(s)
              setError(null)
            }}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              source === s ? 'bg-purple-700 text-white' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {s === 'file' ? <Paperclip className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {s === 'file' ? 'File' : 'Link'}
          </button>
        ))}
      </div>

      {source === 'file' ? (
        <label className="relative flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500 transition-colors hover:border-purple-400">
          <Paperclip className="h-4 w-4 shrink-0 text-purple-700" />
          <span className="min-w-0 truncate">{file ? file.name : 'Choose photo, video or PDF'}</span>
          <input
            type="file"
            accept={EVIDENCE_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
            }}
          />
        </label>
      ) : (
        <input
          className="input"
          type="url"
          placeholder="https://…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setError(null)
          }}
        />
      )}

      {/* proof type */}
      <div className="flex flex-wrap gap-2">
        {EVIDENCE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors',
              type === t ? 'bg-purple-50 text-purple-700 ring-purple-300' : 'bg-white text-gray-500 ring-gray-200 hover:text-gray-800',
            )}
          >
            {EVIDENCE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          className="input"
          placeholder="Short description (optional)"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input className="input sm:w-44" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </div>

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          className="cursor-pointer rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-800"
        >
          Add proof
        </button>
      </div>
    </div>
  )
}
