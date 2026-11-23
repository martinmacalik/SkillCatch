import { FileText, ListChecks, Plus, Video } from 'lucide-react'

/**
 * Placeholder: teachers will create lessons, exercises and checklists for
 * their students here. The functionality comes later.
 */
export function MaterialsSection() {
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Materials</h3>
          <p className="mt-0.5 text-sm text-gray-500">Lessons, exercises and checklists for your students.</p>
        </div>
        <span title="Coming soon" className="flex">
          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-xl bg-purple-300 px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New material
          </button>
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { icon: FileText, title: 'Lesson', text: 'Text, images and links' },
          { icon: Video, title: 'Video', text: 'Show how it is done' },
          { icon: ListChecks, title: 'Exercise', text: 'Tasks to tick off' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border-2 border-dashed border-gray-200 p-4">
            <Icon className="h-5 w-5 text-purple-300" />
            <p className="mt-2 text-sm font-semibold text-gray-400">{title}</p>
            <p className="text-xs text-gray-400">{text}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs font-medium text-gray-400">Coming soon</p>
    </section>
  )
}
