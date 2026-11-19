import { setDigitStyle, type DigitStyle } from "./digits";
import { readStorage, writeStorage } from "./storage";

/**
 * Per-device app preferences (not account settings): the theme and the digit
 * style. Kept in local storage and applied before the first paint.
 */
export type ThemePref = "system" | "light" | "dark";
export type { DigitStyle };

const THEME_KEY = "smart-ats.theme";
const DIGITS_KEY = "smart-ats.digits";

export function readThemePref(): ThemePref {
  const v = readStorage(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function readDigitPref(): DigitStyle {
  return readStorage(DIGITS_KEY) === "arab" ? "arab" : "latn";
}

export const saveThemePref = (v: ThemePref) => writeStorage(THEME_KEY, v);
export const saveDigitPref = (v: DigitStyle) => writeStorage(DIGITS_KEY, v);

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

/** Sets the theme on <html> (CSS tokens follow it) and the browser bar colour. */
export function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b1220" : "#0a1f3d");
}

/** Called once in main.tsx, before React renders, so there is no flash. */
export function applyStoredPrefs() {
  applyTheme(resolveTheme(readThemePref(), systemPrefersDark()));
  setDigitStyle(readDigitPref());
}
