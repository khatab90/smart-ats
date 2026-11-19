import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { currentLang, setLanguage, type Lang } from "../i18n";
import {
  applyTheme,
  readThemePref,
  resolveTheme,
  saveThemePref,
  systemPrefersDark,
  type ThemePref,
} from "../lib/prefs";

interface Prefs {
  theme: ThemePref;
  lang: Lang;
  setTheme: (t: ThemePref) => void;
  /** Saves the language and reloads the app in it. */
  setLang: (l: Lang) => void;
}

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(readThemePref);

  // Follow the phone's light/dark setting live while on "system".
  useEffect(() => {
    applyTheme(resolveTheme(theme, systemPrefersDark()));
    if (theme !== "system") return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => applyTheme(resolveTheme("system", mq.matches));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePref) => {
    saveThemePref(next);
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, lang: currentLang(), setTheme, setLang: setLanguage }),
    [theme, setTheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs must be used inside PrefsProvider");
  return c;
}
