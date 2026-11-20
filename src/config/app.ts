/**
 * Address that email links (sign-up confirmation, password recovery,
 * invitations) and Google sign-in return to when started from the Android
 * app. Android opens the app for it (intent filter in AndroidManifest.xml),
 * and it must be listed under Supabase → Authentication → URL Configuration
 * → Redirect URLs. Override with VITE_APP_LINK_BASE.
 */
export const APP_LINK_BASE: string = import.meta.env.VITE_APP_LINK_BASE || "smartats://app";
