import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";

export const SUPABASE_URL = `https://${projectId}.supabase.co`;

/** Production builds never list or claim boards registered for testing. */
export const APP_ENV: "production" | "test" =
  import.meta.env.VITE_APP_ENV === "test" ? "test" : "production";

// Implicit flow so invitation / confirmation links work when opened on a
// different browser than the one that requested them.
export const supabase = createClient(SUPABASE_URL, publicAnonKey, {
  auth: {
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/** Base URL used for links sent by email (confirmation, recovery, invitations). */
export function appBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

// Isolated, non-persistent client used only to email invitation links, so it
// can never touch the signed-in admin's session storage.
const inviteMailer = createClient(SUPABASE_URL, publicAnonKey, {
  auth: {
    flowType: "implicit",
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "smart-ats-invite-mailer",
  },
});

/** Emails a one-time sign-in link that lands on the invitation screen. */
export async function sendInvitationEmail(email: string, token: string) {
  const redirect = `${appBaseUrl()}?invite=${encodeURIComponent(token)}`;
  return inviteMailer.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, shouldCreateUser: true },
  });
}
