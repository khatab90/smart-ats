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
import type {
  CommandRow,
  Device,
  DeviceSettings,
  DeviceStatus,
  EventRow,
  Membership,
  Role,
} from "../data/types";
import { errorMessage } from "../lib/errors";
import { classifyLink, type LinkState } from "../lib/link";
import { APP_ENV, supabase } from "../lib/supabase";
import { useAuth } from "./auth";

const ACTIVE_KEY = "smart-ats.active-device";

// ---------------------------------------------------------------------------
// Memberships (devices the signed-in user may access)
// ---------------------------------------------------------------------------
interface DevicesCtx {
  memberships: Membership[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
  refresh: () => Promise<void>;
  /** Server clock minus client clock, so staleness uses server time. */
  clockOffsetMs: number;
}

const DevicesContext = createContext<DevicesCtx | null>(null);

export function DevicesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_KEY),
  );
  const [clockOffsetMs, setClockOffset] = useState(0);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const { data, error: err } = await supabase
      .from("device_members")
      .select(
        "role, device:devices!inner(id, environment, name, location, owner_id, claimed_at, firmware)",
      )
      .eq("user_id", uid);
    if (err) {
      setError(errorMessage(err));
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as { role: Role; device: Device }[];
    const list = rows
      .filter((r) => r.device.environment === APP_ENV)
      .map((r) => ({ device: r.device, role: r.role, isOwner: r.device.owner_id === uid }))
      .sort((a, b) => a.device.name.localeCompare(b.device.name, "ar"));
    setMemberships(list);
    setError(null);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void refresh();
    if (!uid) return;
    const channel = supabase
      .channel(`members:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_members", filter: `user_id=eq.${uid}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, refresh]);

  useEffect(() => {
    const sync = async () => {
      const t0 = Date.now();
      const { data, error: err } = await supabase.rpc("server_now");
      if (err || !data) return;
      const t1 = Date.now();
      setClockOffset(Date.parse(data as string) - (t0 + t1) / 2);
    };
    void sync();
    const id = setInterval(sync, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // Keep the selection valid as memberships change.
  useEffect(() => {
    if (loading) return;
    if (!memberships.length) {
      if (activeId) setActiveIdState(null);
      return;
    }
    if (!activeId || !memberships.some((m) => m.device.id === activeId)) {
      setActiveIdState(memberships[0].device.id);
    }
  }, [memberships, activeId, loading]);

  const setActiveId = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveIdState(id);
  }, []);

  const value = useMemo(
    () => ({ memberships, loading, error, activeId, setActiveId, refresh, clockOffsetMs }),
    [memberships, loading, error, activeId, setActiveId, refresh, clockOffsetMs],
  );
  return <DevicesContext.Provider value={value}>{children}</DevicesContext.Provider>;
}

export function useDevices() {
  const c = useContext(DevicesContext);
  if (!c) throw new Error("useDevices must be used inside DevicesProvider");
  return c;
}

// ---------------------------------------------------------------------------
// Active device: live status, settings, events and command updates
// ---------------------------------------------------------------------------
type Listener<T> = (row: T) => void;

interface ActiveDeviceCtx {
  membership: Membership | null;
  device: Device | null;
  isAdmin: boolean;
  isOwner: boolean;
  status: DeviceStatus | null;
  settings: DeviceSettings | null;
  loading: boolean;
  error: string | null;
  link: LinkState;
  /** Board confirmed the current settings version. */
  settingsApplied: boolean;
  realtime: "connecting" | "live" | "polling";
  serverNow: () => number;
  onEvent: (fn: Listener<EventRow>) => () => void;
  onCommand: (fn: Listener<CommandRow>) => () => void;
  refresh: () => Promise<void>;
}

const ActiveContext = createContext<ActiveDeviceCtx | null>(null);

export function ActiveDeviceProvider({ children }: { children: ReactNode }) {
  const { memberships, activeId, clockOffsetMs } = useDevices();
  const membership = memberships.find((m) => m.device.id === activeId) ?? null;
  const deviceId = membership?.device.id ?? null;
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<ActiveDeviceCtx["realtime"]>("connecting");
  const [link, setLink] = useState<LinkState>("never");
  const eventListeners = useRef(new Set<Listener<EventRow>>());
  const commandListeners = useRef(new Set<Listener<CommandRow>>());
  const offsetRef = useRef(clockOffsetMs);
  offsetRef.current = clockOffsetMs;

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    const [s, cfg] = await Promise.all([
      supabase.from("device_status").select("*").eq("device_id", deviceId).maybeSingle(),
      supabase.from("device_settings").select("*").eq("device_id", deviceId).maybeSingle(),
    ]);
    if (s.error || cfg.error) {
      setError(errorMessage(s.error ?? cfg.error));
      return;
    }
    setError(null);
    setStatus(s.data as DeviceStatus | null);
    setSettings(cfg.data as DeviceSettings | null);
  }, [deviceId]);

  useEffect(() => {
    setStatus(null);
    setSettings(null);
    setLink("never");
    if (!deviceId) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    setRealtime("connecting");
    const filter = `device_id=eq.${deviceId}`;
    const channel = supabase
      .channel(`device:${deviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_status", filter },
        (p) => {
          if (p.new && "device_id" in p.new) setStatus(p.new as DeviceStatus);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_settings", filter },
        (p) => {
          if (p.new && "device_id" in p.new) setSettings(p.new as DeviceSettings);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter },
        (p) => {
          eventListeners.current.forEach((fn) => fn(p.new as EventRow));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_commands", filter },
        (p) => {
          if (p.new && "id" in p.new)
            commandListeners.current.forEach((fn) => fn(p.new as CommandRow));
        },
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setRealtime("live");
          void refresh(); // close the gap between first fetch and subscription
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setRealtime("polling");
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deviceId, refresh]);

  // Polling fallback while realtime is unavailable.
  useEffect(() => {
    if (!deviceId || realtime === "live") return;
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [deviceId, realtime, refresh]);

  // Re-evaluate staleness every second (only re-renders when the state changes).
  useEffect(() => {
    const tick = () => setLink(classifyLink(status, serverNow()).state);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, serverNow]);

  const onEvent = useCallback((fn: Listener<EventRow>) => {
    eventListeners.current.add(fn);
    return () => void eventListeners.current.delete(fn);
  }, []);
  const onCommand = useCallback((fn: Listener<CommandRow>) => {
    commandListeners.current.add(fn);
    return () => void commandListeners.current.delete(fn);
  }, []);

  const value = useMemo<ActiveDeviceCtx>(
    () => ({
      membership,
      device: membership?.device ?? null,
      isAdmin: membership?.role === "admin",
      isOwner: Boolean(membership?.isOwner),
      status,
      settings,
      loading,
      error,
      link,
      settingsApplied: Boolean(
        settings &&
        status?.config_version !== null &&
        status?.config_version !== undefined &&
        status.config_version >= settings.version,
      ),
      realtime,
      serverNow,
      onEvent,
      onCommand,
      refresh,
    }),
    [
      membership,
      status,
      settings,
      loading,
      error,
      link,
      realtime,
      serverNow,
      onEvent,
      onCommand,
      refresh,
    ],
  );
  return <ActiveContext.Provider value={value}>{children}</ActiveContext.Provider>;
}

export function useActiveDevice() {
  const c = useContext(ActiveContext);
  if (!c) throw new Error("useActiveDevice must be used inside ActiveDeviceProvider");
  return c;
}

/** Re-renders on an interval so live timers stay current. */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
