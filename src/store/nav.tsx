import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Tab = "home" | "live" | "energy" | "logs" | "more";
export type Route = "notifications" | "profile" | "users" | "devices" | "addDevice" | "settings";

const TABS: readonly Tab[] = ["home", "live", "energy", "logs", "more"];
const ROUTES: readonly Route[] = ["notifications", "profile", "users", "devices", "addDevice", "settings"];

interface NavState {
  tab: Tab;
  view?: string;
  stack: Route[];
}

interface Nav extends NavState {
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  back: () => void;
  /** Jump to a tab with an optional sub-view, closing any pushed screens. */
  go: (t: Tab, view?: string) => void;
}

/**
 * URL form: #/<tab>[:<view>][/<route>…], e.g. #/logs:runtime or
 * #/more/devices/addDevice. Hashes that do not start with "#/" (such as the
 * Supabase auth callback "#access_token=…") are left alone.
 */
export function parseHash(hash: string): NavState | null {
  if (!hash.startsWith("#/")) return null;
  const [head = "", ...rest] = hash.slice(2).split("/").filter(Boolean);
  const [tab, view] = head.split(":");
  if (!TABS.includes(tab as Tab)) return null;
  const stack = rest.filter((r): r is Route => ROUTES.includes(r as Route));
  return { tab: tab as Tab, view: view || undefined, stack };
}

export function toHash(s: NavState): string {
  return `#/${s.tab}${s.view ? `:${s.view}` : ""}${s.stack.map((r) => `/${r}`).join("")}`;
}

const NavContext = createContext<Nav | null>(null);

/**
 * Navigation backed by the browser history: the back button (browser or
 * Android) closes the top screen, a refresh keeps the current screen, and
 * every screen has a shareable address.
 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavState>(
    () => parseHash(window.location.hash) ?? { tab: "home", stack: [] },
  );

  useEffect(() => {
    const onPop = () => setState(parseHash(window.location.hash) ?? { tab: "home", stack: [] });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Latest state for event handlers (history side effects must not run
  // inside state updaters, which React may call twice).
  const ref = useRef(state);
  ref.current = state;

  const navigate = useCallback((next: NavState) => {
    setState(next);
    const hash = toHash(next);
    if (hash !== window.location.hash) window.history.pushState(null, "", hash);
  }, []);

  const setTab = useCallback((tab: Tab) => navigate({ tab, stack: [] }), [navigate]);
  const go = useCallback((tab: Tab, view?: string) => navigate({ tab, view, stack: [] }), [navigate]);
  const push = useCallback(
    (r: Route) => navigate({ ...ref.current, stack: [...ref.current.stack, r] }),
    [navigate],
  );
  const back = useCallback(() => {
    const s = ref.current;
    if (!s.stack.length) return;
    // When the URL matches what we show, let the browser go back so its
    // history stays in sync (popstate applies the change).
    if (window.location.hash === toHash(s) && window.history.length > 1) {
      window.history.back();
      return;
    }
    const next = { ...s, stack: s.stack.slice(0, -1) };
    setState(next);
    window.history.replaceState(null, "", toHash(next));
  }, []);

  const value = useMemo(() => ({ ...state, setTab, push, back, go }), [state, setTab, push, back, go]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav must be used inside NavProvider");
  return n;
}
