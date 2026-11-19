import { useId, type CSSProperties, type ReactNode } from 'react'
import { GraduationCap, Hourglass, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/cn'
import LogoSquare from '@/assets/LogoSquare.png'
import { flagEmoji } from '@/data/countries'
import {
  LEVEL_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type LicenseSkill,
  type TeacherLicense,
  type VerificationKind,
  type VerificationStatus,
} from '@/types/teaching'
import { LICENSE_THEMES, formatNameWithTitles } from './teach-utils'

/* Paper grain: SVG fractal noise as a tiling background (no image file needed). */
const PAPER_NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.2 0 0 0 0.1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/* Perforated postage-stamp edge: holes everywhere, solid content box on top. */
const STAMP_MASK =
  'conic-gradient(#000 0 0) content-box, radial-gradient(circle 3px, #0000 92%, #000) -4px -4px / 8px 8px round'

const STAMP_TILTS = [-2, 1.5, -1, 2.5, -1.5, 1]

/**
 * Size that follows the card width (cqw = 1% of the card) but never gets
 * unreadably small on a phone or oversized on a wide screen.
 */
const fluid = (min: number, cqw: number, max: number) => `clamp(${min}px, ${cqw}cqw, ${max}px)`
const fontSize = (min: number, cqw: number, max: number): CSSProperties => ({ fontSize: fluid(min, cqw, max) })

interface LicenseCardProps {
  license: TeacherLicense
  className?: string
}

/** The teaching license drawn as a postcard. Empty fields are simply left out. */
export function LicenseCard({ license, className }: LicenseCardProps) {
  const theme = LICENSE_THEMES[license.theme]
  const name = formatNameWithTitles(license.displayName, license.titleBefore, license.titleAfter)
  const institution = license.institutionName.trim()
  const bio = license.bio.trim()
  const verification = license.verification.status
  const pad = fluid(14, 4, 26)
  // many skills = more rows of stamps, so the text gets less room
  const dense = license.skills.length > 4

  return (
    // @container: everything inside is sized against the card's own width, so
    // the narrow editor preview and the big view look the same, just scaled.
    <div className={cn('@container mx-auto w-full max-w-[640px]', className)}>
      <article
        // fixed postcard ratio from 448px of card width; narrower (phones) the
        // card takes its natural height so nothing has to be cut off
        className="relative flex flex-col @md:aspect-[1.6] rounded-2xl shadow-[0_18px_40px_-18px_rgba(46,16,101,0.45),0_2px_6px_rgba(0,0,0,0.06)] ring-1 ring-black/5"
        style={{
          backgroundColor: theme.paper,
          backgroundImage: `${PAPER_NOISE}, radial-gradient(ellipse at 20% 0%, rgba(255,255,255,0.8), transparent 60%)`,
        }}
      >
        {/* ── header band ── */}
        <header
          className="flex shrink-0 items-center justify-between gap-3 rounded-t-2xl text-white"
          style={{ background: theme.band, padding: `${fluid(8, 2, 13)} ${pad}` }}
        >
          <div className="flex items-center gap-2">
            <img
              src={LogoSquare}
              alt=""
              className="rounded-md bg-white/95 p-0.5"
              style={{ width: fluid(20, 4.4, 28), height: fluid(20, 4.4, 28) }}
            />
            <span className="font-bold tracking-tight" style={fontSize(12, 2.4, 15)}>
              SkillCatch
            </span>
          </div>
          <span className="font-['Literata'] tracking-[0.28em] text-white/90 uppercase" style={fontSize(9, 1.8, 12)}>
            Teaching License
          </span>
        </header>

        {/* ── body ── */}
        <div className="flex min-h-0 flex-1 gap-4" style={{ padding: `${fluid(12, 3.4, 22)} ${pad} 0` }}>
          {/* overflow-hidden: text that doesn't fit the fixed ratio is cut here, never drawn over the stamps */}
          <div className="min-w-0 flex-1 @md:min-h-0 @md:overflow-hidden">
            <h2 className="font-['Literata'] leading-tight font-medium text-gray-900" style={fontSize(18, 4.6, 30)}>
              {name}
            </h2>
            {license.role && (
              <p className="mt-0.5 font-semibold tracking-wider uppercase" style={{ ...fontSize(10, 1.85, 12.5), color: theme.ink }}>
                {ROLE_LABELS[license.role]}
              </p>
            )}
            {institution && (
              <p className="mt-1.5 flex items-start gap-1.5 font-medium text-gray-700" style={fontSize(11, 2, 13.5)}>
                <span className="shrink-0 leading-snug">{flagEmoji(license.countryCode)}</span>
                {/* wraps on word boundaries, max 2 lines, then "…" */}
                <span className="line-clamp-2 leading-snug">{institution}</span>
              </p>
            )}
            {bio && (
              <>
                <div className="my-2 h-px w-14" style={{ backgroundColor: theme.ink, opacity: 0.35 }} />
                <p
                  className={cn("font-['Literata'] leading-relaxed text-gray-700 italic", dense ? 'line-clamp-2' : 'line-clamp-3')}
                  style={fontSize(11, 2.05, 14)}
                >
                  {bio}
                </p>
              </>
            )}
          </div>

          {/* stamps: verified educator / student + photo, postmark over their corner */}
          <div className="relative flex shrink-0 items-start self-start">
            {verification !== 'none' && (
              <VerifiedStamp
                status={verification}
                kind={license.verification.kind ?? 'educator'}
                ink={theme.ink}
                overlapsPhoto={!!license.photoUrl}
              />
            )}
            {license.photoUrl && (
              <PostageStamp tilt={2} width={fluid(62, 15, 100)}>
                <img
                  src={license.photoUrl}
                  alt=""
                  className="aspect-[5/6] w-full border object-cover"
                  style={{ borderColor: theme.ink }}
                />
              </PostageStamp>
            )}
            <Postmark
              ink={theme.ink}
              year={new Date(license.createdAt).getFullYear()}
              className={
                license.photoUrl || verification !== 'none'
                  ? 'absolute right-[8%] -bottom-[32%] hidden @md:block'
                  : 'relative'
              }
            />
          </div>
        </div>

        {/* ── skill stamps, wrapping inside the card ── */}
        {license.skills.length > 0 && (
          <footer
            className="mt-auto flex shrink-0 flex-wrap border-t border-dashed border-gray-300/80"
            style={{ gap: fluid(8, 1.8, 12), padding: `${fluid(10, 2.4, 16)} ${pad} ${fluid(12, 3, 20)}` }}
          >
            {license.skills.map((skill, i) => (
              <SkillStamp key={skill.id} skill={skill} ink={theme.ink} tilt={STAMP_TILTS[i % STAMP_TILTS.length]} dense={dense} />
            ))}
          </footer>
        )}
      </article>
    </div>
  )
}

/* ── stamps ── */

function PostageStamp({ tilt, width, className, children }: { tilt: number; width: string; className?: string; children: ReactNode }) {
  const mask: CSSProperties = { mask: STAMP_MASK, WebkitMask: STAMP_MASK }
  return (
    // drop-shadow on the wrapper, because a box-shadow would be cut by the mask
    <div className={cn('drop-shadow-[0_2px_3px_rgba(0,0,0,0.18)]', className)} style={{ width, transform: `rotate(${tilt}deg)` }}>
      <div className="bg-white p-1.5" style={mask}>
        {children}
      </div>
    </div>
  )
}

function VerifiedStamp({
  status,
  kind,
  ink,
  overlapsPhoto,
}: {
  status: Exclude<VerificationStatus, 'none'>
  kind: VerificationKind
  ink: string
  overlapsPhoto: boolean
}) {
  const pending = status === 'pending'
  const Icon = pending ? Hourglass : kind === 'student' ? GraduationCap : ShieldCheck
  return (
    <PostageStamp
      tilt={-4}
      width={fluid(54, 12, 80)}
      // tucked under the photo's left edge, like two stamps stuck side by side
      // opaque grey when pending (a translucent stamp would let the photo show through)
      className={cn('relative z-10 mt-[18%]', overlapsPhoto && '-mr-[12%]')}
    >
      <div
        className="flex aspect-[5/6] flex-col items-center justify-center gap-[6%] border text-center"
        style={
          pending
            ? { borderColor: '#9ca3af', background: '#e5e7eb', color: '#6b7280' }
            : { borderColor: ink, background: ink, color: '#fff' }
        }
      >
        <Icon style={{ width: '42%', height: 'auto' }} strokeWidth={1.75} />
        <span className="leading-[1.05] font-extrabold tracking-wider uppercase" style={fontSize(7, 1.25, 8.5)}>
          {pending ? (
            'Pending'
          ) : (
            <>
              Verified
              <br />
              {kind}
            </>
          )}
        </span>
      </div>
    </PostageStamp>
  )
}

function Postmark({ ink, year, className }: { ink: string; year: number; className?: string }) {
  // unique per card, so two cards on one page don't share the <path> id
  const arcId = useId()
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn('pointer-events-none z-20 -rotate-12', className)}
      style={{ color: ink, opacity: 0.45, width: fluid(52, 12.5, 80), height: fluid(52, 12.5, 80) }}
    >
      <defs>
        <path id={arcId} d="M 18 50 A 32 32 0 1 1 82 50" />
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="11" fontWeight="700" letterSpacing="2.5" fill="currentColor">
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          SKILLCATCH
        </textPath>
      </text>
      <text x="50" y="68" fontSize="13" fontWeight="700" textAnchor="middle" fill="currentColor">
        {year}
      </text>
    </svg>
  )
}

function SkillStamp({ skill, ink, tilt, dense }: { skill: LicenseSkill; ink: string; tilt: number; dense: boolean }) {
  return (
    <div
      // dense = one line per stamp, so up to 8 skills fit in two rows
      className={cn('rounded-md border-2 mix-blend-multiply', dense && 'flex items-baseline gap-x-2')}
      style={{
        color: ink,
        borderColor: ink,
        outline: `1px dashed ${ink}`,
        outlineOffset: 2,
        transform: `rotate(${tilt}deg)`,
        padding: `${fluid(4, 0.9, 6)} ${fluid(7, 1.6, 10)}`,
      }}
    >
      <p className="leading-tight font-extrabold tracking-wider whitespace-nowrap uppercase" style={fontSize(9, dense ? 1.55 : 1.7, 11)}>
        {skill.skillName}
      </p>
      <p
        className={cn(
          'flex items-center gap-1.5 font-semibold tracking-widest whitespace-nowrap uppercase opacity-80',
          !dense && 'mt-0.5',
        )}
        style={fontSize(7.5, dense ? 1.3 : 1.45, 9.5)}
      >
        {LEVEL_LABELS[skill.level]}
        <span className="h-1 w-1 rounded-full bg-current" />
        {STATUS_LABELS[skill.status]}
      </p>
    </div>
  )
}
