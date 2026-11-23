import { useState, type ReactNode } from 'react'
import { AlertTriangle, FileText, Info, Mail, RotateCcw, ShieldCheck, Upload } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  VERIFIED_LABELS,
  type EducatorVerification as Verification,
  type VerificationKind,
  type VerificationMethod,
  type VerificationStatus,
} from '@/types/teaching'
import { EMPTY_VERIFICATION, emailMatchesDomains, nowIso } from './teach-utils'

const STATUS_STYLE: Record<VerificationStatus, string> = {
  none: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
}

const DOCUMENT_COPY: Record<VerificationKind, { title: string; examples: string }> = {
  educator: {
    title: 'Upload proof that you teach',
    examples: 'Staff ID, employment contract or confirmation from your school (PDF or image).',
  },
  student: {
    title: 'Upload proof that you study',
    examples: 'Student ID (ISIC) or confirmation of studies from your school (PDF or image).',
  },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOCUMENT_ACCEPT = 'application/pdf,image/*'

interface EducatorVerificationProps {
  value: Verification
  onChange: (next: Verification) => void
  /** What a new check would prove, from the current role. */
  kind: VerificationKind
  /** Selected institution, used for the e-mail domain check. */
  institutionName: string
  institutionDomains: string[] | null
  createPreviewUrl: (file: File) => string
  releasePreviewUrl: (url: string | null) => void
}

/** Optional "verified educator / student" check. Mock: no e-mail is sent, any 6 digits pass. */
export function EducatorVerification({
  value,
  onChange,
  kind,
  institutionName,
  institutionDomains,
  createPreviewUrl,
  releasePreviewUrl,
}: EducatorVerificationProps) {
  const [method, setMethod] = useState<VerificationMethod>(value.method ?? 'email')
  const badgeLabel =
    value.status === 'verified'
      ? VERIFIED_LABELS[value.kind ?? kind]
      : value.status === 'pending'
        ? 'Pending review'
        : 'Not verified'

  const reset = () => {
    releasePreviewUrl(value.documentUrl)
    onChange(EMPTY_VERIFICATION)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_STYLE[value.status])}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {badgeLabel}
        </span>
        {value.status !== 'none' && (
          <button
            type="button"
            onClick={reset}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Start over
          </button>
        )}
      </div>

      {value.status === 'none' ? (
        <>
          {/* method tabs */}
          <div className="mt-4 flex w-fit rounded-xl bg-gray-100 p-1">
            {(
              [
                ['email', 'School e-mail', Mail],
                ['document', 'Upload document', Upload],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  method === m ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {method === 'email' ? (
            <EmailMethod
              initialEmail={value.email ?? ''}
              institutionName={institutionName}
              domains={institutionDomains}
              onVerified={(email, status) =>
                onChange({
                  ...EMPTY_VERIFICATION,
                  kind,
                  method: 'email',
                  status,
                  email,
                  submittedAt: nowIso(),
                  verifiedAt: status === 'verified' ? nowIso() : null,
                })
              }
            />
          ) : (
            <DocumentMethod
              kind={kind}
              onPick={(file) =>
                onChange({
                  ...EMPTY_VERIFICATION,
                  kind,
                  method: 'document',
                  status: 'pending',
                  documentUrl: createPreviewUrl(file),
                  documentFileName: file.name,
                  documentFile: file,
                  submittedAt: nowIso(),
                })
              }
            />
          )}
        </>
      ) : (
        <Summary value={value} />
      )}
    </div>
  )
}

/* ── a) school e-mail + 6-digit code ── */

function EmailMethod({
  initialEmail,
  institutionName,
  domains,
  onVerified,
}: {
  initialEmail: string
  institutionName: string
  domains: string[] | null
  onVerified: (email: string, status: VerificationStatus) => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const trimmed = email.trim()
  const validEmail = EMAIL_RE.test(trimmed)
  const domainMismatch = validEmail && !!domains?.length && !emailMatchesDomains(trimmed, domains)
  // an automatic check is only possible when we know the institution's domains and they match
  const autoVerifiable = validEmail && !!domains?.length && !domainMismatch

  const sendCode = () => {
    if (!validEmail) {
      setError('Enter a valid e-mail address.')
      return
    }
    setError(null)
    setCode('')
    setSentTo(trimmed)
  }

  const confirm = () => {
    if (!/^\d{6}$/.test(code)) {
      setError('The code has 6 digits.')
      return
    }
    // mock: any 6 digits pass. Without a domain match an admin still has to look.
    onVerified(sentTo ?? trimmed, autoVerifiable ? 'verified' : 'pending')
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          type="email"
          placeholder={domains?.length ? `you@${domains[0]}` : 'you@school.edu'}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setSentTo(null)
            setError(null)
          }}
        />
        <button
          type="button"
          onClick={sendCode}
          disabled={!trimmed}
          className="shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-purple-700 ring-1 ring-purple-200 transition-colors hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sentTo ? 'Resend code' : 'Send code'}
        </button>
      </div>

      {domainMismatch && (
        <Note tone="warn">
          This address doesn&apos;t end with {domains?.map((d) => `@${d}`).join(' or ')}, the domain of{' '}
          {institutionName || 'your institution'}. Use your school address, or an admin will review it manually.
        </Note>
      )}
      {validEmail && !domains?.length && (
        <Note tone="info">
          {institutionName
            ? `We don't know the e-mail domain of ${institutionName}, so an admin will verify it manually.`
            : 'Pick your institution above. For institutions typed by hand an admin verifies the e-mail manually.'}
        </Note>
      )}

      {sentTo && (
        <div className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500">
            We sent a 6-digit code to <span className="font-semibold text-gray-700">{sentTo}</span>.{' '}
            <span className="text-gray-400">(Demo: any 6 digits work.)</span>
          </p>
          <div className="flex gap-2">
            <input
              className="input w-36 text-center font-mono tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''))
                setError(null)
              }}
              aria-label="Verification code"
            />
            <button
              type="button"
              onClick={confirm}
              className="cursor-pointer rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-800"
            >
              Verify
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

/* ── b) document upload ── */

function DocumentMethod({ kind, onPick }: { kind: VerificationKind; onPick: (file: File) => void }) {
  const copy = DOCUMENT_COPY[kind]
  return (
    <div className="mt-4">
      <label className="relative flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 transition-colors hover:border-purple-400">
        <Upload className="h-5 w-5 shrink-0 text-purple-700" />
        <span>
          <span className="block font-semibold text-gray-700">{copy.title}</span>
          {copy.examples}
        </span>
        <input
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) onPick(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

/* ── after submitting ── */

function Summary({ value }: { value: Verification }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
      {value.method === 'document' && value.documentUrl ? (
        value.documentFileName?.toLowerCase().endsWith('.pdf') ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-purple-700 ring-1 ring-gray-200">
            <FileText className="h-5 w-5" />
          </div>
        ) : (
          <img src={value.documentUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        )
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-purple-700 ring-1 ring-gray-200">
          <Mail className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium text-gray-900">
          {value.method === 'document' ? value.documentFileName : value.email}
        </p>
        <p className="text-xs text-gray-500">
          {value.status === 'verified'
            ? `E-mail confirmed. Your card shows the ${VERIFIED_LABELS[value.kind ?? 'educator']} stamp.`
            : 'Waiting for an admin to review. Your card shows a pending stamp.'}
        </p>
      </div>
    </div>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'info'; children: ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium',
        tone === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700',
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
