import { useCallback, useEffect, useState } from "react";
import type { EventRow, InvitationRow, MemberRow, SourceId, TelemetryRow } from "../data/types";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { useActiveDevice } from "../store/devices";

interface Result<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const TELEMETRY_COLUMNS =
  "device_ts, active_source, system_state, load_voltage, load_current, load_power_w, load_frequency, grid_voltage, grid_frequency, solar_voltage, solar_frequency, generator_voltage, generator_frequency";

/** Sliding window of raw board readings, appended in realtime. */
export function useTelemetryWindow(
  deviceId: string | null,
  windowMs: number,
): Result<TelemetryRow[]> {
  const { serverNow } = useActiveDevice();
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const since = new Date(serverNow() - windowMs).toISOString();
    const { data, error: err } = await supabase
      .from("telemetry")
      .select(TELEMETRY_COLUMNS)
      .eq("device_id", deviceId)
      .gte("device_ts", since)
      .order("device_ts", { ascending: true })
      .limit(1000);
    if (err) setError(errorMessage(err));
    else {
      setRows(data as TelemetryRow[]);
      setError(null);
    }
    setLoading(false);
  }, [deviceId, windowMs, serverNow]);

  useEffect(() => {
    setRows([]);
    setLoading(true);
    if (!deviceId) return;
    void reload();
    const channel = supabase
      .channel(`telemetry:${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telemetry",
          filter: `device_id=eq.${deviceId}`,
        },
        (p) => {
          const row = p.new as TelemetryRow;
          setRows((prev) => {
            const cutoff = serverNow() - windowMs;
            const next = [...prev, row].filter((r) => Date.parse(r.device_ts) >= cutoff);
            next.sort((a, b) => Date.parse(a.device_ts) - Date.parse(b.device_ts));
            return next;
          });
        },
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") void reload();
      });
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
      void supabase.removeChannel(channel);
    };
  }, [deviceId, windowMs, reload, serverNow]);

  return { data: rows, loading, error, reload };
}

const EVENT_COLUMNS =
  "id, device_id, seq, occurred_at, origin, type, severity, source, from_source, to_source, actor_id, data";

/** Events of the given types since `sinceMs`, newest first, live-appended. */
export function useEvents(
  deviceId: string | null,
  types: string[],
  sinceMs: number,
): Result<EventRow[]> {
  const { onEvent } = useActiveDevice();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const typesKey = types.join(",");

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const { data, error: err } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("device_id", deviceId)
      .in("type", typesKey.split(","))
      .gte("occurred_at", new Date(sinceMs).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(2000);
    if (err) setError(errorMessage(err));
    else {
      setRows(data as EventRow[]);
      setError(null);
    }
    setLoading(false);
  }, [deviceId, typesKey, sinceMs]);

  useEffect(() => {
    setLoading(true);
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
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("device_id", deviceId)
    .in("type", types)
    .lt("occurred_at", new Date(beforeMs).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EventRow | null) ?? null;
}

export interface EnergyRow {
  hour_start: string;
  source: SourceId;
  wh: number;
}

/** Hourly energy buckets aggregated on the server from the board's counters. */
export function useEnergy(
  deviceId: string | null,
  fromMs: number,
  refreshMs = 60_000,
): Result<EnergyRow[]> {
  const [rows, setRows] = useState<EnergyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!deviceId) return;
    const { data, error: err } = await supabase
      .from("energy_hourly")
      .select("hour_start, source, wh")
      .eq("device_id", deviceId)
      .gte("hour_start", new Date(fromMs).toISOString())
      .order("hour_start", { ascending: true })
      .limit(5000);
    if (err) setError(errorMessage(err));
    else {
      setRows(data as EnergyRow[]);
      setError(null);
    }
    setLoading(false);
  }, [deviceId, fromMs]);

  useEffect(() => {
    setLoading(true);
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
    const m = await supabase
      .from("device_members")
      .select("user_id, role, added_at, profile:profiles(id, email, phone, full_name)")
      .eq("device_id", deviceId)
      .order("added_at", { ascending: true });
    if (m.error) {
      setError(errorMessage(m.error));
      setLoading(false);
      return;
    }
    setMembers(m.data as unknown as MemberRow[]);
    if (includeInvitations) {
      const inv = await supabase
        .from("invitations")
        .select("id, email, role, created_at, last_sent_at, expires_at, accepted_at, revoked_at")
        .eq("device_id", deviceId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (inv.error) setError(errorMessage(inv.error));
      else setInvitations(inv.data as InvitationRow[]);
    } else {
      setInvitations([]);
    }
    setError(null);
    setLoading(false);
  }, [deviceId, includeInvitations]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { members, invitations, loading, error, reload };
}
