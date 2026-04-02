import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  console.log("🔒 ProtectedRoute:", { loading, hasSession: !!session });

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!session) {
    console.log("❌ No session, redirecting to /signin");
    return <Navigate to="/signin" replace />;
  }

  console.log("✅ Session valid, rendering protected content");
  return <>{children}</>;
}
