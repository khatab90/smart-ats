import { EN } from "./en";

/**
 * Interface language. Arabic is the source language: every user-facing
 * string is written in Arabic and wrapped in t(); the English catalog maps
 * it. Numbers stay Western in both languages.
 *
 * The language is read once at start-up (before any module builds its
 * labels) and changing it reloads the app, so labels kept in constants are
 * always in the right language.
 */
export type Lang = "ar" | "en";

const KEY = "smart-ats.lang";

function stored(): Lang {
  try {
    return window.localStorage.getItem(KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

let lang: Lang = stored();

export const currentLang = (): Lang => lang;
export const isRtl = () => lang === "ar";
export const textDir = (): "rtl" | "ltr" => (lang === "ar" ? "rtl" : "ltr");
/** Physical side where lines start (for inline styles on LTR number blocks). */
export const uiStart = (): "right" | "left" => (lang === "ar" ? "right" : "left");

/** Test helper: switch without reloading. */
export function setLangForTests(next: Lang) {
  lang = next;
}

type Vars = Record<string | number, string | number | null | undefined>;

/** Translates an Arabic source string; {0}, {name} are filled from `vars`. */
export function t(source: string, vars?: Vars): string {
  const text = lang === "en" ? (EN[source] ?? source) : source;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

/** Saves the language and reloads so every label is rebuilt in it. */
export function setLanguage(next: Lang) {
  if (next === lang) return;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
  window.location.reload();
}

/** <html lang/dir>, set in main.tsx before the first paint. */
export function applyLanguageToDocument() {
  document.documentElement.lang = lang;
  document.documentElement.dir = textDir();
}
