import type { Session } from "@supabase/supabase-js";
import { appBaseUrl, supabase } from "./client";
import { fail, ok, run, type Result } from "./result";
import { t } from "../i18n";

export const getSession = () => supabase.auth.getSession().then(({ data }) => data.session);

export function onAuthChange(fn: (event: string, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(fn);
  return () => data.subscription.unsubscribe();
}

export async function signIn(
  email: string,
  password: string,
): Promise<Result<null> & { unconfirmed?: boolean }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ...fail(error), unconfirmed: /not confirmed/i.test(error.message) };
  return ok(null);
}

/** Returns whether a session started immediately (email confirmation off). */
export const signUp = (email: string, password: string, fullName: string) =>
  run(
    supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: appBaseUrl() },
    }),
    (d) => ({ signedIn: Boolean(d.session) }),
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

export const requestPhoneChange = (phone: string) =>
  run(supabase.auth.updateUser({ phone }), () => null);

export const verifyPhoneChange = (phone: string, token: string) =>
  run(supabase.auth.verifyOtp({ phone, token, type: "phone_change" }), () => null);

export const signOut = () => supabase.auth.signOut();

/**
 * Google sign-in (OAuth through Supabase). The browser leaves for Google and
 * comes back to `redirectTo` with the session; a pending invitation token is
 * carried along so the invitation screen still opens.
 */
export const signInWithGoogle = (invite?: string | null) =>
  run(
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: invite ? `${appBaseUrl()}?invite=${encodeURIComponent(invite)}` : appBaseUrl(),
        queryParams: { prompt: "select_account" },
      },
    }),
    () => null,
  );

/** Sign-in methods of the current user ("email", "google"), from Supabase. */
export function signInMethods(user: { app_metadata?: { providers?: unknown } } | null): string[] {
  const p = user?.app_metadata?.providers;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
}
