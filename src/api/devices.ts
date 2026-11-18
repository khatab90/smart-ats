import type { Device, DeviceSettings, DeviceStatus, Role } from "../data/types";
import { asRow, run } from "./result";
import { supabase } from "./client";

export const listMemberships = (userId: string) =>
  run(
    supabase
      .from("device_members")
      .select(
        "role, device:devices!inner(id, environment, name, location, owner_id, claimed_at, firmware)",
      )
      .eq("user_id", userId),
    (rows) => rows.map((r) => ({ role: r.role as Role, device: asRow<Device>(r.device) })),
  );

export const claimDevice = (args: {
  deviceId: string;
  pin: string;
  environment: string;
  name: string;
  location: string | null;
  timezone: string;
}) =>
  run(
    supabase.rpc("claim_device", {
      p_device_id: args.deviceId,
      p_pin: args.pin,
      p_environment: args.environment,
      p_name: args.name,
      p_location: args.location ?? undefined,
      p_timezone: args.timezone,
    }),
    (d) => d as { ok: boolean; error?: string; device_id?: string },
  );

export const renameDevice = (id: string, name: string, location: string | null) =>
  run(supabase.from("devices").update({ name, location }).eq("id", id), () => null);

export const releaseDevice = (id: string) =>
  run(supabase.rpc("release_device", { p_device_id: id }), () => null);
export const leaveDevice = (id: string) =>
  run(supabase.rpc("leave_device", { p_device_id: id }), () => null);

export const fetchStatus = (id: string) =>
  run(supabase.from("device_status").select("*").eq("device_id", id).maybeSingle(), (d) =>
    d ? asRow<DeviceStatus>(d) : null,
  );

export const fetchSettings = (id: string) =>
  run(supabase.from("device_settings").select("*").eq("device_id", id).maybeSingle(), (d) =>
    d ? asRow<DeviceSettings>(d) : null,
  );

export const serverNow = () =>
  run(supabase.rpc("server_now"), (d) => (d ? Date.parse(d) : Date.now()));

/** Connection summary for several devices (device picker). */
export const fetchLinkSummaries = (ids: string[]) =>
  run(
    supabase
      .from("device_status")
      .select("device_id, online, last_seen_at, interval_ms")
      .in("device_id", ids),
    (rows) => rows,
  );
