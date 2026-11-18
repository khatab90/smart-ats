import { useCallback, useEffect, useState } from "react";
import * as history from "../api/history";
import * as membersApi from "../api/members";
import { subscribeTelemetry } from "../api/realtime";
import type { EventRow, InvitationRow, MemberRow, TelemetryRow } from "../data/types";
import { useDeviceMeta } from "../store/devices";

export type { EnergyRow } from "../api/history";

interface Result<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Sliding window of raw board readings, appended in realtime. */
export function useTelemetryWindow(deviceId: string | null, windowMs: number): Result<TelemetryRow[]> {
  const { serverNow } = useDeviceMeta();
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState(deviceId);

  if (loadedFor !== deviceId) {
    setLoadedFor(deviceId);
    setRows([]);
    setLoading(true);
  }

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
    const unsubscribe = subscribeTelemetry(
      deviceId,
      (row) =>
        setRows((prev) => {
          const cutoff = serverNow() - windowMs;
          const next = [...prev, row].filter((r) => Date.parse(r.device_ts) >= cutoff);
          next.sort((a, b) => Date.parse(a.device_ts) - Date.parse(b.device_ts));
          return next;
        }),
      () => void reload(),
    );
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
      clearInterval(trim);
      unsubscribe();
    };
  }, [deviceId, windowMs, reload, serverNow]);

  return { data: rows, loading, error, reload };
}

/** Events of the given types since `sinceMs`, newest first, live-appended. */
export function useEvents(deviceId: string | null, types: string[], sinceMs: number): Result<EventRow[]> {
  const { onEvent } = useDeviceMeta();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const typesKey = types.join(",");

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
    }
    setLoading(false);
  }, [deviceId, typesKey, sinceMs]);

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
export function useEnergy(deviceId: string | null, fromMs: number, refreshMs = 60_000): Result<history.EnergyRow[]> {
  const [rows, setRows] = useState<history.EnergyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const { data, error: err } = await history.fetchEnergy(deviceId, new Date(fromMs).toISOString());
    if (err !== null) setError(err);
    else {
      setRows(data);
      setError(null);
    }
    setLoading(false);
  }, [deviceId, fromMs]);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), refreshMs);
    return () => clearInterval(id);
  }, [reload, refreshMs]);

  return { data: rows, loading, error, reload };
}

export function useMembers(deviceId: string | null, includeInvitations: boolean) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (includeInvitations) {
      const inv = await membersApi.listPendingInvitations(deviceId);
      if (inv.error !== null) setError(inv.error);
      else setInvitations(inv.data);
    } else {
      setInvitations([]);
    }
    setError(null);
    setLoading(false);
  }, [deviceId, includeInvitations]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { members, invitations, loading, error, reload };
}
