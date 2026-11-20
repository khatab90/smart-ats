import { createClient } from "@supabase/supabase-js";
import { APP_LINK_BASE } from "../config/app";
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
    // Sessions from email links and Google arrive through smartats://app
    // (store/auth.tsx), never in the page address.
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/**
 * Where links sent by email (confirmation, recovery, invitations) and the
 * return from Google sign-in lead: the app itself, through smartats://app.
 */
export const appBaseUrl = () => APP_LINK_BASE;

export type RealtimeUnsubscribe = () => void;
