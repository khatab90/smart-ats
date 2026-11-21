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
import { needsFirstPassword } from "../domain/account";
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
  /**
   * After an email link (invitation or confirmation) opened an account that
   * has no password: "checking" while asking the server, "ask" to offer one.
   */
  firstPassword: "checking" | "ask" | null;
  clearFirstPassword: () => void;
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
  const [firstPassword, setFirstPassword] = useState<AuthCtx["firstPassword"]>(null);

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
        // Invitation and confirmation links can open an account that was
        // made without a password (the invitation link creates it).
        const emailLink = link.type === "magiclink" || link.type === "signup";
        // Set before the session starts so the main screen never flashes.
        if (recoveryLink) setRecovery(true);
        if (emailLink) setFirstPassword("checking");
        void authApi.startSessionFromLink(link.tokens).then(async ({ data: email, error }) => {
          if (error === null) {
            if (!emailLink) return;
            const status = email ? await authApi.accountStatus(email) : null;
            setFirstPassword(
              status?.error === null && needsFirstPassword(status.data) ? "ask" : null,
            );
            return;
          }
          if (recoveryLink) setRecovery(false);
          if (emailLink) setFirstPassword(null);
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
      firstPassword,
      clearFirstPassword: () => setFirstPassword(null),
      refreshProfile,
      signOut,
    }),
    [loading, session, profile, dbError, recovery, firstPassword, refreshProfile, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
