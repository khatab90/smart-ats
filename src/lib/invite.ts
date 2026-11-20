import { useSyncExternalStore } from "react";
import { isNative } from "../platform/native";
import { readStorage, removeStorage, writeStorage } from "./storage";

/**
 * Invitation token from a ?invite=… link, kept until handled.
 *
 * Web: session storage (this tab only). Android: local storage, because the
 * system may stop the app while the user confirms their email elsewhere.
 * Observable, so a link that arrives while the app is open shows at once.
 */
const KEY = "smart-ats.invite";
const area = () => (isNative() ? "local" : "session");
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getPendingInvite = () => readStorage(KEY, area());

export function savePendingInvite(token: string) {
  writeStorage(KEY, token, area());
  emit();
}

export function clearPendingInvite() {
  removeStorage(KEY, area());
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function usePendingInvite() {
  return useSyncExternalStore(subscribe, getPendingInvite, () => null);
}

/** Web: take ?invite=… from the page address and remove it from the bar. */
export function captureInviteFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("invite");
  if (!token) return;
  savePendingInvite(token);
  url.searchParams.delete("invite");
  // Keep the hash: it may carry the auth session from the email link.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
