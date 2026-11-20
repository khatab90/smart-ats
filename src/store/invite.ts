import { useSyncExternalStore } from "react";
import { readStorage, removeStorage, writeStorage } from "../lib/storage";

/**
 * Invitation token from a link that opened the app (smartats://app?invite=…),
 * kept until handled. Local storage, because the system may stop the app
 * while the user confirms their email elsewhere. Observable, so a link that
 * arrives while the app is open shows at once.
 */
const KEY = "smart-ats.invite";
const area = () => "local" as const;
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
