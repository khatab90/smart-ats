import { createClient } from "@supabase/supabase-js";
import { APP_LINK_BASE } from "../config/app";
import { isNative } from "../platform/native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/supabase";
import type { Database } from "../data/database.types";

/**
 * The single, typed Supabase client. Every query in the app goes through
 * the modules in src/api — screens and stores never call Supabase directly.
 *
 * Implicit flow (not PKCE) so confirmation / invitation links still work when
 * opened in a different browser than the one that requested them
 * (see docs/DECISIONS.md, ADR-003).
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/**
 * Base URL used for links sent by email (confirmation, recovery, invitations)
 * and for the return from Google sign-in. Inside the Android app the page
 * address is the app's private origin, which a link cannot open, so links
 * come back through smartats://app instead.
 */
export function appBaseUrl() {
  if (isNative()) return APP_LINK_BASE;
  return `${window.location.origin}${window.location.pathname}`;
}

export type RealtimeUnsubscribe = () => void;
