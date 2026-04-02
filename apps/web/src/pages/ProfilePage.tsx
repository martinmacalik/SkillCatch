import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthProvider";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch profile from database
    const fetchProfile = async () => {
      if (!session?.user) return;

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
      } else {
        setProfile(profileData);
      }

      setLoading(false);
    };

    fetchProfile();
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold text-gray-900">SC</div>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-900 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Welcome Banner */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Welcome to SkillPath! 🎉
          </h1>
          <p className="text-gray-600">
            Your email has been verified and your account is ready.
          </p>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Profile Information
          </h2>

          <div className="space-y-4">
            <InfoRow label="Email" value={session?.user?.email || "N/A"} />
            
            {profile?.first_name && (
              <InfoRow 
                label="First Name" 
                value={profile.first_name} 
              />
            )}
            
            {profile?.last_name && (
              <InfoRow 
                label="Last Name" 
                value={profile.last_name} 
              />
            )}

            {profile?.username && (
              <InfoRow 
                label="Username" 
                value={profile.username} 
              />
            )}

            {profile?.avatar_url && (
              <InfoRow 
                label="Avatar" 
                value={
                  <img 
                    src={profile.avatar_url} 
                    alt="Avatar" 
                    className="w-12 h-12 rounded-full"
                  />
                } 
              />
            )}

            <InfoRow 
              label="User ID" 
              value={session?.user?.id || "N/A"} 
            />

            <InfoRow 
              label="Email Verified" 
              value={
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Yes
                </span>
              } 
            />

            <InfoRow 
              label="Account Created" 
              value={profile?.created_at 
                ? new Date(profile.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "N/A"
              } 
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ActionCard
            title="Explore Skills"
            description="Start building your skill path"
            onClick={() => navigate("/")}
          />
          <ActionCard
            title="Settings"
            description="Manage your account settings"
            onClick={() => alert("Settings coming soon!")}
          />
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start py-3 border-b border-gray-100 last:border-0">
      <div className="w-40 text-sm font-medium text-gray-500">{label}</div>
      <div className="flex-1 text-sm text-gray-900">{value}</div>
    </div>
  );
}

function ActionCard({ 
  title, 
  description, 
  onClick 
}: { 
  title: string; 
  description: string; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:border-gray-300 hover:shadow-md transition-all"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </button>
  );
}
