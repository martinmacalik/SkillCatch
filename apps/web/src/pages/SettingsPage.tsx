import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthProvider";

export default function SettingsPage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<{
    first_name: string | null;
    last_name: string | null;
  } | null>(null);
  const [passwordEmailSent, setPasswordEmailSent] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [session]);

  const email = session?.user?.email ?? "";
  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    : email;

  const handleSendPasswordReset = async () => {
    if (!email) return;
    await supabase.auth.resetPasswordForEmail(email);
    setPasswordEmailSent(true);
  };

  return (
    <div className="flex flex-1 flex-col gap-8 overflow-y-auto skills-scroll px-7 -mx-7 py-5 -my-5">
      <div>
        <h1 className="text-4xl font-normal text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">Manage your account preferences.</p>
      </div>

      {/* Profile section */}
      <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h2 className="text-xl font-normal text-gray-900">Profile</h2>
        <p className="mt-0.5 text-sm text-gray-400">Your personal information.</p>

        <div className="mt-6 flex items-center gap-5">
          {/* Avatar placeholder */}
          <div className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-purple-300 to-indigo-400" />
          <div>
            <p className="text-2xl font-normal text-gray-900">{displayName || "—"}</p>
            <p className="mt-0.5 text-sm text-gray-400">{email}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs text-gray-400 uppercase tracking-widest">First name</p>
            <p className="text-base text-gray-800">{profile?.first_name || "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-gray-400 uppercase tracking-widest">Last name</p>
            <p className="text-base text-gray-800">{profile?.last_name || "—"}</p>
          </div>
          <div className="col-span-2">
            <p className="mb-1 text-xs text-gray-400 uppercase tracking-widest">Email</p>
            <p className="text-base text-gray-800">{email || "—"}</p>
          </div>
        </div>
      </div>

      {/* Password section */}
      <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h2 className="text-xl font-normal text-gray-900">Password</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Change your password by receiving a reset link via email.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSendPasswordReset}
            disabled={passwordEmailSent}
            className="rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {passwordEmailSent ? "Email sent" : "Send password reset email"}
          </button>
          {passwordEmailSent && (
            <p className="text-sm text-gray-400">Check your inbox at {email}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
