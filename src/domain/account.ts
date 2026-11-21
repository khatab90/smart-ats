/** What the server knows about an email's account (public.account_status). */
export type AccountStatus =
  | { status: "none" }
  | { status: "unconfirmed" | "ready"; password: boolean; google: boolean };

/**
 * Why a password sign-in was refused, so the screen can say what to do:
 * create the account, confirm it, set a first password, or use Google.
 */
export type SignInProblem =
  | "no_account"
  | "unconfirmed"
  | "no_password"
  | "google"
  | "wrong_password";

export function signInProblem(a: AccountStatus): SignInProblem {
  if (a.status === "none") return "no_account";
  if (a.status === "unconfirmed") return "unconfirmed";
  if (a.password) return "wrong_password";
  return a.google ? "google" : "no_password";
}

/** A confirmed account that can only be opened by an email link, never by a password. */
export const needsFirstPassword = (a: AccountStatus | null) =>
  a !== null && a.status === "ready" && !a.password && !a.google;
