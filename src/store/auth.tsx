import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Profile } from "../data/types";
import { isSchemaMissing } from "../lib/errors";
import * as authApi from "../api/auth";
import { probeProfile } from "../api/profile";

interface AuthCtx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Database not reachable or migration not applied. */
  dbError: "schema" | "network" | null;
  recovery: boolean;
  clearRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dbError, setDbError] = useState<AuthCtx["dbError"]>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let alive = true;
    void authApi.getSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setLoading(false);
    });
    const unsubscribe = authApi.onAuthChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setProfile(null);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await probeProfile(userId);
    if (error) {
      setDbError(isSchemaMissing(error) ? "schema" : "network");
      return;
    }
    setDbError(null);
    setProfile(data as Profile | null);
  }, [userId]);

  useEffect(() => {
    if (userId) void refreshProfile();
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await authApi.signOut();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      dbError,
      recovery,
      clearRecovery: () => setRecovery(false),
      refreshProfile,
      signOut,
    }),
    [loading, session, profile, dbError, recovery, refreshProfile, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
