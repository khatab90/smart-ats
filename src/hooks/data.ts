import { useCallback, useEffect, useState } from "react";
import * as history from "../api/history";
import * as membersApi from "../api/members";
import { subscribeTelemetry } from "../api/realtime";
import type { EventRow, InvitationRow, MemberRow, TelemetryRow } from "../data/types";
import { useDeviceMeta } from "../store/devices";
import { cacheGet, cacheSet, cachedWindow } from "../lib/cache";

export type { EnergyRow } from "../api/history";

/**
 * `loading` is true only while there is nothing to show yet: data fetched
 * earlier in the session is shown at once and refreshed in the background.
 */
interface Result<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Sliding window of raw board readings, appended in realtime. */
export function useTelemetryWindow(
  deviceId: string | null,
  windowMs: number,
): Result<TelemetryRow[]> {
  const { serverNow } = useDeviceMeta();
  const key = `telemetry:${deviceId}:${windowMs}`;
  const fromCache = () =>
    cachedWindow<TelemetryRow>(key, serverNow() - windowMs, (r) => Date.parse(r.device_ts));
  const [rows, setRows] = useState<TelemetryRow[]>(() => fromCache() ?? []);
  const [loading, setLoading] = useState(() => !fromCache());
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState(deviceId);

  if (loadedFor !== deviceId) {
    const cached = fromCache();
    setLoadedFor(deviceId);
    setRows(cached ?? []);
    setLoading(!cached);
  }

  // Live rows are kept in the cache too, so returning to the screen is instant.
  useEffect(() => {
    if (deviceId && !loading) cacheSet(key, { since: serverNow() - windowMs, rows });
  }, [key, deviceId, loading, rows, serverNow, windowMs]);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const since = new Date(serverNow() - windowMs).toISOString();
    const { data, error: err } = await history.fetchTelemetry(deviceId, since);
    if (err !== null) setError(err);
    else {
      setRows(data);
      setError(null);
    }
    setLoading(false);
  }, [deviceId, windowMs, serverNow]);

  useEffect(() => {
    if (!deviceId) return;
    // Load at once; live rows then arrive over realtime. If realtime is not
    // connected (blocked network, server hiccup), the window is re-read every
    // 5 s instead, so the chart never stays empty waiting for it.
    let live = false;
    void reload();
    const unsubscribe = subscribeTelemetry(
      deviceId,
      (row) =>
        setRows((prev) => {
          const cutoff = serverNow() - windowMs;
          const next = [...prev, row].filter((r) => Date.parse(r.device_ts) >= cutoff);
          next.sort((a, b) => Date.parse(a.device_ts) - Date.parse(b.device_ts));
          return next;
        }),
      (state) => {
        const wasLive = live;
        live = state === "live";
        // Fill the gap between the first load and the moment realtime started.
        if (live && !wasLive) void reload();
      },
    );
    const poll = setInterval(() => {
      if (!live) void reload();
    }, 5000);
    // Trim the window even when no new rows arrive (board offline).
    const trim = setInterval(() => {
      const cutoff = serverNow() - windowMs;
      setRows((prev) =>
        prev.length && Date.parse(prev[0].device_ts) < cutoff
          ? prev.filter((r) => Date.parse(r.device_ts) >= cutoff)
          : prev,
      );
    }, 5000);
    return () => {
      clearInterval(poll);
      clearInterval(trim);
      unsubscribe();
    };
  }, [deviceId, windowMs, reload, serverNow]);

  return { data: rows, loading, error, reload };
}

/** Events of the given types since `sinceMs`, newest first, live-appended. */
export function useEvents(
  deviceId: string | null,
  types: string[],
  sinceMs: number,
): Result<EventRow[]> {
  const { onEvent } = useDeviceMeta();
  const typesKey = types.join(",");
  const key = `events:${deviceId}:${typesKey}`;
  const fromCache = () => cachedWindow<EventRow>(key, sinceMs, (r) => Date.parse(r.occurred_at));
  const [rows, setRows] = useState<EventRow[]>(() => fromCache() ?? []);
  const [loading, setLoading] = useState(() => !fromCache());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const { data, error: err } = await history.fetchEvents(
      deviceId,
      typesKey.split(","),
      new Date(sinceMs).toISOString(),
    );
    if (err !== null) setError(err);
    else {
      setRows(data);
      setError(null);
      cacheSet(key, { since: sinceMs, rows: data });
    }
    setLoading(false);
  }, [deviceId, typesKey, sinceMs, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(
    () =>
      onEvent((e) => {
        if (e.device_id !== deviceId || !typesKey.split(",").includes(e.type)) return;
        setRows((prev) =>
          prev.some((r) => r.id === e.id)
            ? prev
            : [e, ...prev].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)),
        );
      }),
    [onEvent, deviceId, typesKey],
  );

  return { data: rows, loading, error, reload };
}

/** Most recent event of the given types strictly before `beforeMs` (window seeding). */
export async function lastEventBefore(deviceId: string, types: string[], beforeMs: number) {
  const { data } = await history.lastEventBefore(deviceId, types, new Date(beforeMs).toISOString());
  return data ?? null;
}

/** Hourly energy buckets aggregated on the server from the board's counters. */
export function useEnergy(
  deviceId: string | null,
  fromMs: number,
  refreshMs = 60_000,
): Result<history.EnergyRow[]> {
  const key = `energy:${deviceId}`;
  const fromCache = () =>
    cachedWindow<history.EnergyRow>(key, fromMs, (r) => Date.parse(r.hour_start));
  const [rows, setRows] = useState<history.EnergyRow[]>(() => fromCache() ?? []);
  const [loading, setLoading] = useState(() => !fromCache());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const { data, error: err } = await history.fetchEnergy(
      deviceId,
      new Date(fromMs).toISOString(),
    );
    if (err !== null) setError(err);
    else {
      setRows(data);
      setError(null);
      cacheSet(key, { since: fromMs, rows: data });
    }
    setLoading(false);
  }, [deviceId, fromMs, key]);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), refreshMs);
    return () => clearInterval(id);
  }, [reload, refreshMs]);

  return { data: rows, loading, error, reload };
}

export function useMembers(deviceId: string | null, includeInvitations: boolean) {
  const key = `members:${deviceId}:${includeInvitations}`;
  const cached = cacheGet<{ members: MemberRow[]; invitations: InvitationRow[] }>(key);
  const [members, setMembers] = useState<MemberRow[]>(cached?.members ?? []);
  const [invitations, setInvitations] = useState<InvitationRow[]>(cached?.invitations ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const m = await membersApi.listMembers(deviceId);
    if (m.error !== null) {
      setError(m.error);
      setLoading(false);
      return;
    }
    setMembers(m.data);
    let inv: InvitationRow[] = [];
    if (includeInvitations) {
      const res = await membersApi.listPendingInvitations(deviceId);
      if (res.error !== null) setError(res.error);
      else inv = res.data;
    }
    setInvitations(inv);
    cacheSet(key, { members: m.data, invitations: inv });
    setError(null);
    setLoading(false);
  }, [deviceId, includeInvitations, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { members, invitations, loading, error, reload };
}
