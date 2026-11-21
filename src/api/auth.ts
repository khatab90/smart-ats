import type { Session } from "@supabase/supabase-js";
import { openInBrowser } from "../platform/native";
import { appBaseUrl, supabase } from "./client";
import { fail, ok, run, type Result } from "./result";
import type { AccountStatus } from "../domain/account";
import { t } from "../i18n";

export const getSession = () => supabase.auth.getSession().then(({ data }) => data.session);

export function onAuthChange(fn: (event: string, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(fn);
  return () => data.subscription.unsubscribe();
}

export async function signIn(
  email: string,
  password: string,
): Promise<Result<null> & { unconfirmed?: boolean; refused?: boolean }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    return {
      ...fail(error),
      unconfirmed: /not confirmed/i.test(error.message),
      refused: /invalid login credentials/i.test(error.message),
    };
  return ok(null);
}

/** What kind of account an email has: none, waiting for confirmation, or ready. */
export const accountStatus = (email: string) =>
  run(supabase.rpc("account_status", { p_email: email }), (d) => d as unknown as AccountStatus);

/**
 * Returns whether a session started immediately (email confirmation off) and
 * whether the email already had a confirmed account — Supabase then answers
 * without an error and sends no email, so the screen must say so itself.
 */
export const signUp = (email: string, password: string, fullName: string) =>
  run(
    supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: appBaseUrl() },
    }),
    (d) => ({ signedIn: Boolean(d.session), exists: d.user?.identities?.length === 0 }),
  );

export const resendConfirmation = (email: string) =>
  run(
    supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: appBaseUrl() } }),
    () => null,
  );

export const sendPasswordReset = (email: string) =>
  run(supabase.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() }), () => null);

export const setPassword = (password: string) =>
  run(supabase.auth.updateUser({ password }), () => null);

/** Re-authenticates before changing the password, so a left-open session cannot. */
export async function changePassword(
  email: string,
  current: string,
  next: string,
): Promise<Result<null>> {
  const re = await supabase.auth.signInWithPassword({ email, password: current });
  if (re.error) return { data: null, error: t("كلمة المرور الحالية غير صحيحة") };
  return setPassword(next);
}

export const requestEmailChange = (email: string) =>
  run(supabase.auth.updateUser({ email }, { emailRedirectTo: appBaseUrl() }), () => null);

export const signOut = () => supabase.auth.signOut();

/**
 * Google sign-in. Google opens in the phone's browser (it refuses sign-in
 * inside an app) and returns to the app through smartats://app, where the
 * auth store starts the session. A pending invitation token is carried along
 * so the invitation screen still opens.
 */
export async function signInWithGoogle(invite?: string | null) {
  const redirectTo = invite ? `${appBaseUrl()}?invite=${encodeURIComponent(invite)}` : appBaseUrl();
  const res = await run(
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
        skipBrowserRedirect: true,
      },
    }),
    (d) => d.url ?? null,
  );
  if (res.error === null && res.data) await openInBrowser(res.data);
  return res;
}

/** Starts the session carried by a link that opened the Android app; gives its email. */
export const startSessionFromLink = (tokens: { access_token: string; refresh_token: string }) =>
  run(supabase.auth.setSession(tokens), (d) => d.user?.email ?? null);

/** Sign-in methods of the current user ("email", "google"), from Supabase. */
export function signInMethods(user: { app_metadata?: { providers?: unknown } } | null): string[] {
  const p = user?.app_metadata?.providers;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
}
