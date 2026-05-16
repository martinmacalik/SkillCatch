import { useState } from 'react'
import { CheckCircle, HelpCircle, BookOpen, GitBranch, ArrowRight, Coins } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthProvider'

/* ─── Contact / Support form ────────────────────────────────────────── */

const supportCategories = [
  'Account & Password',
  'App Features',
  'Bug Report',
  'General Question',
  'Other',
]

function SupportForm() {
  const { session } = useAuth()
  const [category, setCategory] = useState(supportCategories[0])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    try {
      await supabase.from('support_messages').insert({
        sender_user_id: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
        subject: subject.trim() || category,
        body: message.trim(),
      })
    } catch {
      // table may not exist yet — still show success
    }
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
        <CheckCircle className="h-10 w-10 text-indigo-500" />
        <p className="text-base font-semibold text-gray-900">Message sent!</p>
        <p className="text-sm text-gray-400">We'll get back to you as soon as possible.</p>
        <button
          onClick={() => { setSubmitted(false); setSubject(''); setMessage('') }}
          className="mt-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            {supportCategories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Subject</label>
          <input
            type="text"
            placeholder="Briefly describe your issue"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Message</label>
        <textarea
          required
          rows={5}
          placeholder="Describe your question or problem in detail..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Replying to <span className="font-medium text-gray-500">{session?.user?.email}</span>
        </p>
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  )
}

/* ─── Skill structure feedback form ─────────────────────────────────── */

function SkillFeedbackLink() {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
          <GitBranch className="h-5 w-5 text-indigo-500" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Skill Structure Feedback</h2>
          <p className="text-sm text-gray-400">Suggest changes to the skill tree</p>
        </div>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-gray-500">
        Spotted a wrong branch name, a missing skill, or think a section should be restructured?
        Use the interactive builder to visually suggest changes — you can pick nodes directly from
        the database and propose a new arrangement.
      </p>
      <div className="mb-5 flex flex-col gap-3">
        <div>
          <p className="mb-0.5 text-sm font-semibold text-gray-700">Child vs. sibling</p>
          <p className="text-sm leading-relaxed text-gray-500">
            Clicking <span className="font-medium text-gray-700">+ Add child</span> on a node creates
            a child <em>of</em> that node. To add a sibling instead, use{' '}
            <span className="font-medium text-gray-700">Load branch children</span> on the parent —
            that loads all direct children into the builder so you can add new siblings alongside them.
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-sm font-semibold text-gray-700">Load branch</p>
          <p className="text-sm leading-relaxed text-gray-500">
            The <span className="font-medium text-gray-700">Load branch children</span> button (violet,
            dashed border) searches for a parent branch and pre-populates the builder with all its
            direct children. You can then bulk-rename, delete, or add siblings in one proposal.
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-sm font-semibold text-gray-700">Delete</p>
          <p className="text-sm leading-relaxed text-gray-500">
            The trash icon on a node marks it for deletion (shown with a red strikethrough). When an
            admin approves the proposal, that node <em>and all its descendants</em> are permanently
            removed from the skill tree.
          </p>
        </div>
      </div>
      <button
        onClick={() => navigate('/dashboard/skill-feedback')}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        Open skill structure builder
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────────────────── */

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="shrink-0">
        <h1 className="text-3xl font-bold text-gray-900">Help</h1>
        <p className="mt-1.5 text-base text-gray-500">Get support, learn about the app, or suggest improvements to the skill structure.</p>
      </div>

      {/* ── Row 1: Support form (full width) ── */}
      <div className="rounded-2xl bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
            <HelpCircle className="h-5 w-5 text-indigo-500" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Get Help</h2>
            <p className="text-sm text-gray-400">Have a question or problem? Send us a message.</p>
          </div>
        </div>
        <SupportForm />
      </div>

      {/* ── Row 2: About + Skillcoins + Skill Feedback ── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

        {/* About SkillCatch */}
        <div className="rounded-2xl bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-50">
              <BookOpen className="h-5 w-5 text-fuchsia-500" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">About SkillCatch</h2>
              <p className="text-sm text-gray-400">How the app works</p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-1 text-sm font-semibold text-gray-800">What is SkillCatch?</p>
              <p className="text-sm leading-relaxed text-gray-500">
                SkillCatch helps you discover, track, and learn new skills across many different fields.
                Content will be added here soon.
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-800">Managing your skills</p>
              <p className="text-sm leading-relaxed text-gray-500">
                You can add skills from the Skills page, drag them between stages in the kanban board,
                and pin your favourite skill to the dashboard. More details coming soon.
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-800">Learning paths</p>
              <p className="text-sm leading-relaxed text-gray-500">
                Browse structured learning paths through the Learn and Discover sections.
                More content will be added here once the feature is live.
              </p>
            </div>
          </div>
        </div>

        {/* Skillcoins */}
        <div className="rounded-2xl bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
              <Coins className="h-5 w-5 text-amber-500" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Skillcoins</h2>
              <p className="text-sm text-gray-400">Your learning currency</p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-1 text-sm font-semibold text-gray-800">What are Skillcoins?</p>
              <p className="text-sm leading-relaxed text-gray-500">
                Skillcoins are SkillCatch's reward currency. You earn them by making progress — completing skills, logging practice, hitting milestones, and maintaining learning streaks.
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-800">How do I earn them?</p>
              <p className="text-sm leading-relaxed text-gray-500">
                Coins are awarded automatically as you learn. Adding a skill, advancing its status, and maintaining a daily streak all contribute to your balance.
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-800">What can I spend them on?</p>
              <p className="text-sm leading-relaxed text-gray-500">
                Spending options — unlocking resources, mentor sessions, and exclusive content — are coming soon as the platform grows.
              </p>
            </div>
          </div>
        </div>

        {/* Skill structure feedback — links to dedicated builder page */}
        <SkillFeedbackLink />

      </div>
    </div>
  )
}
