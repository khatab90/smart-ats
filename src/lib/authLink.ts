import { t } from "../i18n";
/**
 * Reads the result of an email link (confirmation, recovery, invitation) or
 * of Google sign-in from the page address.
 *
 * Supabase (implicit flow, ADR-003) appends the session to the fragment:
 *   …?invite=T#access_token=…&refresh_token=…&type=recovery
 * or an error:
 *   …#error=access_denied&error_code=otp_expired&error_description=…
 *
 * Pure: no storage, no network.
 */

export interface AuthLink {
  /** Invitation token from ?invite=… */
  invite: string | null;
  /** Session tokens to start the session with (native only; the web client reads them itself). */
  tokens: { access_token: string; refresh_token: string } | null;
  /** signup | recovery | invite | magiclink | email_change … */
  type: string | null;
  /** Arabic message when the link failed. */
  error: string | null;
}

const EMPTY: AuthLink = { invite: null, tokens: null, type: null, error: null };

function params(part: string): URLSearchParams {
  return new URLSearchParams(part.replace(/^[?#]/, ""));
}

export function linkErrorText(code: string | null, description: string | null): string {
  if (code === "access_denied" && /cancel|denied by user/i.test(description ?? "")) {
    return t("أُلغي تسجيل الدخول بـ Google.");
  }
  if (code === "otp_expired" || /expired|invalid/i.test(description ?? "")) {
    return t("انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطاً جديداً.");
  }
  return t("تعذر فتح الرابط. حاول مرة أخرى أو اطلب رابطاً جديداً.");
}

export function parseAuthLink(url: string): AuthLink {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return EMPTY;
  }
  const query = u.searchParams;
  // Navigation hashes (#/home…) are not auth fragments.
  const fragment = u.hash.startsWith("#/") ? new URLSearchParams() : params(u.hash);
  const pick = (k: string) => fragment.get(k) ?? query.get(k);

  const invite = query.get("invite")?.trim() || null;
  const errorCode = pick("error_code");
  const errorDescription = pick("error_description");
  const hasError = Boolean(pick("error") || errorCode || errorDescription);

  const access = fragment.get("access_token");
  const refresh = fragment.get("refresh_token");
  return {
    invite,
    tokens:
      !hasError && access && refresh ? { access_token: access, refresh_token: refresh } : null,
    type: pick("type"),
    error: hasError ? linkErrorText(errorCode, errorDescription) : null,
  };
}

/** True for a link meant for this app (smartats://app…, or another configured base). */
export function isAppLink(url: string, base: string): boolean {
  return (
    url === base ||
    url.startsWith(`${base}?`) ||
    url.startsWith(`${base}#`) ||
    url.startsWith(`${base}/`)
  );
}
