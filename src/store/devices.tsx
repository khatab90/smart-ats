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
import * as devicesApi from "../api/devices";
import { subscribeDevice, subscribeMemberships, type ChannelState } from "../api/realtime";
import { APP_ENV } from "../config/supabase";
import type { CommandRow, DeviceSettings, DeviceStatus, EventRow, Membership } from "../data/types";
import { classifyLink, type LinkState } from "../lib/link";
import { readStorage, writeStorage } from "../lib/storage";
import { useAuth } from "./auth";
import { onAppResume } from "../platform/native";

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
  const [activeId, setActiveIdState] = useState<string | null>(() => readStorage(ACTIVE_KEY));
  const [clockOffsetMs, setClockOffset] = useState(0);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const { data, error: err } = await devicesApi.listMemberships(uid);
    if (err !== null) {
      setError(err);
      setLoading(false);
      return;
    }
    const list = data
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
    return subscribeMemberships(uid, () => void refresh());
  }, [uid, refresh]);

  useEffect(() => {
    const sync = async () => {
      const t0 = Date.now();
      const { data } = await devicesApi.serverNow();
      if (data === null) return;
      const t1 = Date.now();
      setClockOffset(data - (t0 + t1) / 2);
    };
    void sync();
    const id = setInterval(sync, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // Keep the selection valid as memberships change.
  const validActiveId =
    loading || !memberships.length
      ? loading
        ? activeId
        : null
      : memberships.some((m) => m.device.id === activeId)
        ? activeId
        : memberships[0].device.id;

  const setActiveId = useCallback((id: string) => {
    writeStorage(ACTIVE_KEY, id);
    setActiveIdState(id);
  }, []);

  const value = useMemo(
    () => ({
      memberships,
      loading,
      error,
      activeId: validActiveId,
      setActiveId,
      refresh,
      clockOffsetMs,
    }),
    [memberships, loading, error, validActiveId, setActiveId, refresh, clockOffsetMs],
  );
  return <DevicesContext.Provider value={value}>{children}</DevicesContext.Provider>;
}

export function useDevices() {
  const c = useContext(DevicesContext);
  if (!c) throw new Error("useDevices must be used inside DevicesProvider");
  return c;
}

// ---------------------------------------------------------------------------
// Active device. Split in two contexts so components that only need the
// device, role or settings do not re-render on every 2-second status update.
// ---------------------------------------------------------------------------
type Listener<T> = (row: T) => void;

interface DeviceMetaCtx {
  membership: Membership | null;
  device: Membership["device"] | null;
  isAdmin: boolean;
  isOwner: boolean;
  settings: DeviceSettings | null;
  loading: boolean;
  error: string | null;
  realtime: ChannelState;
  serverNow: () => number;
  onEvent: (fn: Listener<EventRow>) => () => void;
  onCommand: (fn: Listener<CommandRow>) => () => void;
  refresh: () => Promise<void>;
}

interface DeviceLiveCtx {
  status: DeviceStatus | null;
  link: LinkState;
  /** Board confirmed the current settings version. */
  settingsApplied: boolean;
}

const MetaContext = createContext<DeviceMetaCtx | null>(null);
const LiveContext = createContext<DeviceLiveCtx | null>(null);

export function ActiveDeviceProvider({ children }: { children: ReactNode }) {
  const { memberships, activeId, clockOffsetMs } = useDevices();
  const membership = memberships.find((m) => m.device.id === activeId) ?? null;
  const deviceId = membership?.device.id ?? null;
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<ChannelState>("connecting");
  const [link, setLink] = useState<LinkState>("never");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const eventListeners = useRef(new Set<Listener<EventRow>>());
  const commandListeners = useRef(new Set<Listener<CommandRow>>());
  const offsetRef = useRef(clockOffsetMs);
  useEffect(() => {
    offsetRef.current = clockOffsetMs;
  }, [clockOffsetMs]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // Reset per-device state when the selection changes (during render, so no
  // stale device is ever shown).
  if (loadedFor !== deviceId) {
    setLoadedFor(deviceId);
    setStatus(null);
    setSettings(null);
    setLink("never");
    setLoading(Boolean(deviceId));
    setRealtime("connecting");
  }

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    const [s, cfg] = await Promise.all([
      devicesApi.fetchStatus(deviceId),
      devicesApi.fetchSettings(deviceId),
    ]);
    if (s.error !== null || cfg.error !== null) {
      setError(s.error ?? cfg.error);
      return;
    }
    setError(null);
    setStatus(s.data);
    setSettings(cfg.data);
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    let alive = true;
    void refresh().finally(() => alive && setLoading(false));
    const unsubscribe = subscribeDevice(deviceId, {
      status: setStatus,
      settings: setSettings,
      event: (row) => eventListeners.current.forEach((fn) => fn(row)),
      command: (row) => commandListeners.current.forEach((fn) => fn(row)),
      state: (st) => {
        setRealtime(st);
        if (st === "live") void refresh(); // close the gap between first fetch and subscription
      },
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [deviceId, refresh]);

  // Back from the background (phone locked, app switched): the realtime
  // socket may have been paused, so read the current state at once.
  useEffect(() => {
    if (!deviceId) return;
    return onAppResume(() => void refresh());
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

  const meta = useMemo<DeviceMetaCtx>(
    () => ({
      membership,
      device: membership?.device ?? null,
      isAdmin: membership?.role === "admin",
      isOwner: Boolean(membership?.isOwner),
      settings,
      loading,
      error,
      realtime,
      serverNow,
      onEvent,
      onCommand,
      refresh,
    }),
    [membership, settings, loading, error, realtime, serverNow, onEvent, onCommand, refresh],
  );

  const configVersion = status?.config_version ?? null;
  const live = useMemo<DeviceLiveCtx>(
    () => ({
      status,
      link,
      settingsApplied: Boolean(
        settings && configVersion !== null && configVersion >= settings.version,
      ),
    }),
    [status, link, settings, configVersion],
  );

  return (
    <MetaContext.Provider value={meta}>
      <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
    </MetaContext.Provider>
  );
}

/** Device, role, settings and helpers — stable between status updates. */
export function useDeviceMeta() {
  const c = useContext(MetaContext);
  if (!c) throw new Error("useDeviceMeta must be used inside ActiveDeviceProvider");
  return c;
}

/** Everything about the active device, including the live status. */
export function useActiveDevice() {
  const meta = useDeviceMeta();
  const live = useContext(LiveContext);
  if (!live) throw new Error("useActiveDevice must be used inside ActiveDeviceProvider");
  return { ...meta, ...live };
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
