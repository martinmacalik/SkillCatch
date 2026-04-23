import { useAuth } from '../contexts/AuthProvider'
import { IdentitySection } from '../components/settings/IdentitySection'
import { AccountSection } from '../components/settings/AccountSection'
import { PreferencesSection } from '../components/settings/PreferencesSection'

export default function SettingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  return (
    <div className="skills-scroll -mx-7 -my-5 flex flex-1 flex-col gap-8 overflow-y-auto px-7 py-5">
      <div>
        <h1 className="text-4xl font-normal text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">Manage your account preferences.</p>
      </div>

      {userId ? (
        <>
          <IdentitySection userId={userId} />
          <AccountSection />
          <PreferencesSection userId={userId} />
        </>
      ) : (
        <div className="rounded-2xl bg-white p-6 text-sm text-gray-500">
          You need to be signed in to manage settings.
        </div>
      )}
    </div>
  )
}
