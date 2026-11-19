import { readStorage, writeStorage } from "./storage";

/**
 * After a new version is published, an open tab still points at the old
 * screen files, which no longer exist on the server; opening a screen then
 * fails. The fix is to load the new version once.
 */

const PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite
];

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return PATTERNS.some((p) => p.test(message));
}

const KEY = "smart-ats.reloaded-at";
/** A second failure soon after reloading is a real outage, not a new version. */
const GUARD_MS = 30_000;

/**
 * Reloads the page unless it was already reloaded for this reason in the
 * last 30 seconds. Returns whether a reload was started.
 */
export function reloadForNewVersion(
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  const last = Number(readStorage(KEY, "session") ?? 0);
  if (now - last < GUARD_MS) return false;
  writeStorage(KEY, String(now), "session");
  reload();
  return true;
}
