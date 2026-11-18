import { createClient } from "@supabase/supabase-js";
import { APP_ENV, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/supabase";

export { APP_ENV, SUPABASE_URL };

// Implicit flow so invitation / confirmation links work when opened on a
// different browser than the one that requested them.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
const inviteMailer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
