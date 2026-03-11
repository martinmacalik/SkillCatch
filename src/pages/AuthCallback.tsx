import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // If tokens are in the URL hash, supabase-js will pick them up
    // when detectSessionInUrl is true. Calling getSession ensures
    // the session is loaded and persisted.
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        console.error(error);
        navigate("/signin", { replace: true });
        return;
      }

      if (data.session) {
        const user = data.session.user;
        const meta = user.user_metadata ?? {};

        // Split full_name (GitHub/Google) or use first_name/last_name (email signup)
        const fullName: string = meta.full_name ?? meta.name ?? "";
        const parts = fullName.trim().split(/\s+/);
        const firstName = meta.first_name ?? (parts[0] || null);
        const lastName = meta.last_name ?? (parts.slice(1).join(" ") || null);

        // Upsert profile — only fills in fields that are currently null
        await supabase.from("profiles").upsert(
          {
            id: user.id,
            first_name: firstName,
            last_name: lastName,
            avatar_url: meta.avatar_url ?? null,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
            ignoreDuplicates: false,
          }
        );

        navigate("/dashboard", { replace: true });
      } else {
        navigate("/signin", { replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-2xl font-medium text-gray-900 mb-4">
          Signing you in…
        </div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
      </div>
    </div>
  );
}
