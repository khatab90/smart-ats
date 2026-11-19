import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setDigitStyle } from "../lib/digits";
import { startArabicDigits } from "../lib/digitsDom";
import {
  applyTheme,
  readDigitPref,
  readThemePref,
  resolveTheme,
  saveDigitPref,
  saveThemePref,
  systemPrefersDark,
  type DigitStyle,
  type ThemePref,
} from "../lib/prefs";

interface Prefs {
  theme: ThemePref;
  digits: DigitStyle;
  setTheme: (t: ThemePref) => void;
  setDigits: (d: DigitStyle) => void;
}

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(readThemePref);
  const [digits, setDigitsState] = useState<DigitStyle>(readDigitPref);

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

  // Arabic-Indic digits everywhere on screen, fixed texts included.
  useEffect(() => (digits === "arab" ? startArabicDigits() : undefined), [digits]);

  const setTheme = useCallback((t: ThemePref) => {
    saveThemePref(t);
    setThemeState(t);
  }, []);

  const setDigits = useCallback((d: DigitStyle) => {
    saveDigitPref(d);
    setDigitStyle(d);
    setDigitsState(d);
  }, []);

  const value = useMemo(
    () => ({ theme, digits, setTheme, setDigits }),
    [theme, digits, setTheme, setDigits],
  );
  // Every formatted number reads the digit style when it renders, so the app
  // is redrawn once when it changes (screen and data come back from the URL
  // and the server).
  return (
    <Ctx.Provider value={value}>
      <Fragment key={digits}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs must be used inside PrefsProvider");
  return c;
}
