import { Plus } from 'lucide-react'

/** Greyed-out "blank postcard" shown before the user has a license. */
export function EmptyLicenseState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="@container">
        <div className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white/70 @xl:aspect-16/10">
          {/* ghost header band */}
          <div className="flex items-center justify-between bg-gray-200/70 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gray-300" />
              <div className="h-3 w-20 rounded-full bg-gray-300" />
            </div>
            <span className="font-['Literata'] text-[10px] tracking-[0.28em] text-gray-400 uppercase @lg:text-xs">
              Teaching License
            </span>
          </div>

          {/* ghost stamp in the corner */}
          <div className="absolute top-16 right-5 hidden h-24 w-20 rotate-2 rounded-sm border-2 border-dashed border-gray-300 @md:block" />

          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center @md:px-28">
            <h2 className="text-xl font-bold text-gray-900 @lg:text-2xl">You don&apos;t have a teaching license yet</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              A license is your teacher&apos;s business card. It shows the skills you master well enough to
              teach others, backed by proof like certificates, competitions or home showcases.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-6 flex cursor-pointer items-center gap-2 rounded-xl bg-purple-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
            >
              <Plus className="h-4 w-4" />
              Create license
            </button>
          </div>

          {/* ghost skill stamps */}
          <div className="flex gap-3 border-t border-dashed border-gray-300 px-5 py-4">
            {[24, 20, 28].map((w) => (
              <div key={w} className="h-9 rounded-md border-2 border-dashed border-gray-300" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
