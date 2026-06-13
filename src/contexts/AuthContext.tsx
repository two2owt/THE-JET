import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadConsents } from "@/lib/consent";
import { analytics } from "@/lib/analytics";
import { SESSION_BROADCAST_KEY } from "@/lib/authSession";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  refreshSession: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Centralized session refresh function
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session: refreshedSession }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Session refresh error:", error.message);
        return;
      }
      setSession(refreshedSession);
      setUser(refreshedSession?.user ?? null);
    } catch (err) {
      console.error("Session refresh failed:", err);
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        // Only synchronous state updates here
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setIsLoading(false);

        // Refresh runtime consent cache whenever auth identity changes
        loadConsents(currentSession?.user?.id ?? null).catch(() => undefined);

        // Funnel instrumentation — identify on sign-in, reset on sign-out.
        // Wrapped in try/catch so analytics can never break auth flow.
        try {
          if (event === "SIGNED_IN" && currentSession?.user) {
            analytics.identify(currentSession.user.id);
            const provider =
              (currentSession.user.app_metadata as { provider?: string } | null)
                ?.provider ?? "email";
            analytics.authEvent("login");
            analytics.track("Auth Signed In", { provider });
          } else if (event === "SIGNED_OUT") {
            analytics.authEvent("logout");
            analytics.reset();
          }
        } catch {
          // analytics is best-effort
        }

        // Handle specific auth events
        if (event === "TOKEN_REFRESHED") {
          if (import.meta.env.DEV) console.log("Session token refreshed successfully");
        }

        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
        }

        // Broadcast session change to other tabs/windows
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") {
          try {
            localStorage.setItem(SESSION_BROADCAST_KEY, Date.now().toString());
          } catch (e) {
            // localStorage may not be available
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setIsLoading(false);
      loadConsents(existingSession?.user?.id ?? null).catch(() => undefined);
    });

    // Listen for session changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SESSION_BROADCAST_KEY) {
        refreshSession();
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Set up a visibility change listener to refresh session when tab becomes active
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Set up periodic session check (every 5 minutes for better responsiveness)
    const intervalId = setInterval(() => {
      refreshSession();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [refreshSession]);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};