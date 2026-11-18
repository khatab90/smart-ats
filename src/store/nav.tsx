import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Tab = "home" | "live" | "energy" | "logs" | "more";
export type Route = "notifications" | "profile" | "users" | "devices" | "addDevice" | "settings";

interface Nav {
  tab: Tab;
  setTab: (t: Tab) => void;
  stack: Route[];
  push: (r: Route) => void;
  back: () => void;
  /** Jump to a tab with an optional sub-view, closing any pushed screens. */
  go: (t: Tab, view?: string) => void;
  view?: string;
}

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>("home");
  const [stack, setStack] = useState<Route[]>([]);
  const [view, setView] = useState<string>();

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    setStack([]);
    setView(undefined);
  }, []);
  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const go = useCallback((t: Tab, v?: string) => {
    setTabState(t);
    setStack([]);
    setView(v);
  }, []);

  const value = useMemo(
    () => ({ tab, setTab, stack, push, back, go, view }),
    [tab, setTab, stack, push, back, go, view],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav must be used inside NavProvider");
  return n;
}
