import type { EventRow, SourceId, TelemetryRow } from "../data/types";
import { supabase } from "./client";
import { asRow, run } from "./result";

const TELEMETRY_COLUMNS =
  "device_ts, active_source, system_state, load_voltage, load_current, load_power_w, load_frequency, grid_voltage, grid_frequency, solar_voltage, solar_frequency, generator_voltage, generator_frequency";

const EVENT_COLUMNS =
  "id, device_id, seq, occurred_at, origin, type, severity, source, from_source, to_source, actor_id, data";

/** Newest `limit` readings since `sinceIso`, returned oldest first. */
export const fetchTelemetry = (deviceId: string, sinceIso: string, limit = 1000) =>
  run(
    supabase
      .from("telemetry")
      .select(TELEMETRY_COLUMNS)
      .eq("device_id", deviceId)
      .gte("device_ts", sinceIso)
      .order("device_ts", { ascending: false })
      .limit(limit),
    (rows) => (rows as unknown as TelemetryRow[]).reverse(),
  );

export const fetchEvents = (deviceId: string, types: string[], sinceIso: string, limit = 2000) =>
  run(
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("device_id", deviceId)
      .in("type", types as EventRow["type"][])
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(limit),
    (rows) => rows.map((r) => asRow<EventRow>(r)),
  );

/** Most recent event of the given types strictly before `beforeIso`. */
export const lastEventBefore = (deviceId: string, types: string[], beforeIso: string) =>
  run(
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("device_id", deviceId)
      .in("type", types as EventRow["type"][])
      .lt("occurred_at", beforeIso)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (r) => (r ? asRow<EventRow>(r) : null),
  );

export interface EnergyRow {
  hour_start: string;
  source: SourceId;
  wh: number;
}

export const fetchEnergy = (deviceId: string, fromIso: string) =>
  run(
    supabase
      .from("energy_hourly")
      .select("hour_start, source, wh")
      .eq("device_id", deviceId)
      .gte("hour_start", fromIso)
      .order("hour_start", { ascending: true })
      .limit(5000),
    (rows) => rows as EnergyRow[],
  );
