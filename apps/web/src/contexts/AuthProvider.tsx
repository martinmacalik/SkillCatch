import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Grab existing session from storage
    supabase.auth.getSession().then(({ data }) => {
      console.log("🔍 AuthProvider: Loading session from storage", data.session);
      setSession(data.session ?? null);
      setLoading(false);
    });

    // 2) Listen for changes (login/logout/refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log("🔄 AuthProvider: Auth state changed", _event, newSession);
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
