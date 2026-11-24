import { useAuth } from '../contexts/AuthProvider'
import { IdentitySection } from '../components/settings/IdentitySection'
import { AccountSection } from '../components/settings/AccountSection'
import { PreferencesSection } from '../components/settings/PreferencesSection'
import { useSearchFocus } from '../hooks/useSearchFocus'

export default function SettingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id
  // from the global search: scroll to the section and flash it
  useSearchFocus(!!userId)

  return (
    <div className="skills-scroll -mx-7 -my-5 flex flex-1 flex-col gap-8 overflow-y-auto px-7 py-5">
      <div>
        <h1 className="text-4xl font-normal text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">Manage your account preferences.</p>
      </div>

      {userId ? (
        <>
          <div id="settings-identity" className="scroll-mt-4 rounded-2xl">
            <IdentitySection userId={userId} />
          </div>
          <div id="settings-account" className="scroll-mt-4 rounded-2xl">
            <AccountSection />
          </div>
          <div id="settings-preferences" className="scroll-mt-4 rounded-2xl">
            <PreferencesSection userId={userId} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-white p-6 text-sm text-gray-500">
          You need to be signed in to manage settings.
        </div>
      )}
    </div>
  )
}
