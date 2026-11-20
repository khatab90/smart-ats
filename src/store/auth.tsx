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
import { schemaProblem } from "../lib/errors";
import * as authApi from "../api/auth";
import { APP_LINK_BASE } from "../config/app";
import { isAppLink, parseAuthLink } from "../lib/authLink";
import { savePendingInvite } from "./invite";
import { closeBrowser, onAppLink } from "../platform/native";
import { probeProfile } from "../api/profile";
import { useToast } from "./toast";
import { cacheClear } from "../lib/cache";
import { t } from "../i18n";

interface AuthCtx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Database not reachable or migration not applied. */
  dbError: "schema" | "outdated" | "network" | null;
  recovery: boolean;
  clearRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { pushToast } = useToast();
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

  // Android: email links and Google sign-in come back through smartats://app…
  // instead of loading a page, so the session they carry is started here.
  useEffect(
    () =>
      onAppLink((url) => {
        if (!isAppLink(url, APP_LINK_BASE)) return;
        closeBrowser();
        const link = parseAuthLink(url);
        if (link.invite) savePendingInvite(link.invite);
        if (link.error) {
          pushToast({ kind: "error", title: t("تعذر تسجيل الدخول"), body: link.error });
          return;
        }
        if (!link.tokens) return;
        const recoveryLink = link.type === "recovery";
        // Set before the session starts so the main screen never flashes.
        if (recoveryLink) setRecovery(true);
        void authApi.startSessionFromLink(link.tokens).then(({ error }) => {
          if (!error) return;
          if (recoveryLink) setRecovery(false);
          pushToast({ kind: "error", title: t("تعذر تسجيل الدخول من الرابط"), body: error });
        });
      }),
    [pushToast],
  );

  const userId = session?.user.id;
  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await probeProfile(userId);
    if (error) {
      const problem = schemaProblem(error);
      setDbError(
        problem === "missing" ? "schema" : problem === "outdated" ? "outdated" : "network",
      );
      return;
    }
    setDbError(null);
    setProfile(data as Profile | null);
  }, [userId]);

  useEffect(() => {
    if (userId) void refreshProfile();
  }, [userId, refreshProfile]);

  // Another account (or none): nothing fetched for the previous one is kept.
  useEffect(() => cacheClear, [userId]);

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
