/** Invitation token from a ?invite=… link, kept for this tab until handled. */
const KEY = "smart-ats.invite";

export function captureInviteFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("invite");
  if (!token) return;
  sessionStorage.setItem(KEY, token);
  url.searchParams.delete("invite");
  // Keep the hash: it may carry the auth session from the email link.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export const getPendingInvite = () => sessionStorage.getItem(KEY);
export const clearPendingInvite = () => sessionStorage.removeItem(KEY);
