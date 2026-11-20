import { readStorage, writeStorage } from "./storage";

/**
 * Per-device app preferences (not account settings). Kept in local storage and applied before the first paint.
 */
export type ThemePref = "system" | "light" | "dark";

const THEME_KEY = "smart-ats.theme";

export function readThemePref(): ThemePref {
  const v = readStorage(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export const saveThemePref = (v: ThemePref) => writeStorage(THEME_KEY, v);

/** The theme actually shown for a preference and the phone's setting. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Sets the theme on <html>; the CSS tokens follow it. */
export function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
}

/** Called once in main.tsx, before React renders, so there is no flash. */
export function applyStoredPrefs() {
  applyTheme(resolveTheme(readThemePref(), systemPrefersDark()));
}
