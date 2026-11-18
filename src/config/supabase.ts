/**
 * Supabase project the app talks to.
 *
 * The anon key is a public, RLS-restricted key and is safe to ship in the
 * bundle. Both values can be overridden per environment with
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
 */
const DEFAULT_PROJECT_ID = "xevpdinzdqljlllpmvmz";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldnBkaW56ZHFsamxsbHBtdm16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2ODY1NDcsImV4cCI6MjExMDI2MjU0N30.DvPBXT7kj8tbkx3plmTik30j8I8SNccRGDoQnL4ZaVE";

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || `https://${DEFAULT_PROJECT_ID}.supabase.co`;

export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

/** Production builds never list or claim boards registered for testing. */
export const APP_ENV: "production" | "test" =
  import.meta.env.VITE_APP_ENV === "test" ? "test" : "production";
