/**
 * Domain types used by the app.
 *
 * Every row type is DERIVED from the generated database types
 * (database.types.ts, produced from supabase/migrations by `npm run gen:types`),
 * so a column added, removed or renamed in SQL breaks the build here instead
 * of failing at runtime. Only JSON columns get a hand-written shape, which
 * mirrors the ESP32 protocol (docs/ESP32_PROTOCOL.md).
 *
 * Electrical values are nullable: null means "no reading", never "zero".
 */
import type { Database, Tables } from "./database.types";

type Fn<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F];

// ----------------------------------------------------------- enumerations
export type SourceId = NonNullable<Tables<"device_status">["active_source"]>;
export type SystemMode = NonNullable<Tables<"device_status">["mode"]>;
export type SystemState = NonNullable<Tables<"device_status">["system_state"]>;
export type Role = Tables<"device_members">["role"];
export type Environment = Tables<"devices">["environment"];
export type CommandType = Tables<"device_commands">["type"];
export type CommandStatus = Tables<"device_commands">["status"];
export type NotificationType = Tables<"notifications">["type"];
export type EventType = Tables<"events">["type"];
export type Severity = Tables<"events">["severity"];

// ------------------------------------------------- protocol JSON payloads
export interface SourceReport {
  v: number | null;
  f: number | null;
  available?: boolean;
  qualified?: boolean;
  q_elapsed_s?: number | null;
  q_required_s?: number | null;
  reason?: string | null;
}

export interface LoadReport {
  v: number | null;
  a: number | null;
  w: number | null;
  f: number | null;
}

export interface ProtectionOverride {
  active: boolean;
  at?: string | null;
  reason?: string | null;
  requested?: SourceId | null;
}

export interface ControllerHealth {
  uptime_s?: number;
  reset_reason?: string;
  temp_c?: number;
  supply_v?: number;
  dropped_events?: number;
}

type PerSource<T> = Partial<Record<SourceId, T>>;

// ------------------------------------------------------------------- rows
export type DeviceStatus = Omit<
  Tables<"device_status">,
  "sources" | "load" | "contactors" | "alarms" | "override" | "controller" | "energy_wh" | "runtime"
> & {
  sources: PerSource<SourceReport> | null;
  load: LoadReport | null;
  contactors: PerSource<{ cmd: boolean; fb: boolean }> | null;
  alarms: string[] | null;
  override: ProtectionOverride | null;
  controller: ControllerHealth | null;
  energy_wh: PerSource<number> | null;
  runtime: PerSource<{ s: number; since: string | null }> | null;
};

export type Device = Pick<
  Tables<"devices">,
  "id" | "environment" | "name" | "location" | "owner_id" | "claimed_at" | "firmware"
>;

export interface Membership {
  device: Device;
  role: Role;
  isOwner: boolean;
}

export type DeviceSettings = Omit<Tables<"device_settings">, "updated_by">;

/** Settings an admin may change (mirrors the column grant in the migration). */
export type EditableSettings = Omit<DeviceSettings, "device_id" | "version" | "updated_at">;

export type EventRow = Omit<Tables<"events">, "data" | "received_at" | "boot_id"> & {
  data: Record<string, unknown>;
};

export type TelemetryRow = Pick<
  Tables<"telemetry">,
  | "device_ts"
  | "active_source"
  | "system_state"
  | "load_voltage"
  | "load_current"
  | "load_power_w"
  | "load_frequency"
  | "grid_voltage"
  | "grid_frequency"
  | "solar_voltage"
  | "solar_frequency"
  | "generator_voltage"
  | "generator_frequency"
> & { active_source: SourceId | null; system_state: SystemState | null };

export type CommandRow = Pick<
  Tables<"device_commands">,
  "id" | "device_id" | "type" | "status" | "created_at" | "expires_at"
> & {
  payload: Record<string, unknown>;
  result: { reason?: string; message?: string } | null;
};

/** Facts behind a notification; the app renders the text from these. */
export interface NotificationParams {
  event?: string;
  source?: SourceId | null;
  from?: SourceId | null;
  to?: SourceId | null;
  kind?: string | null;
  value?: string | null;
  reason?: string | null;
  device?: string;
}

export type NotificationRow = Pick<
  Tables<"notifications">,
  "id" | "device_id" | "type" | "critical" | "title" | "body" | "created_at" | "read_at"
> & { params: NotificationParams };

export type NotificationPrefs = Pick<
  Tables<"notification_preferences">,
  | "source_outage"
  | "transfer"
  | "electrical_fault"
  | "connection_lost"
  | "transfer_failed"
  | "sound"
>;

export type Profile = Pick<Tables<"profiles">, "id" | "email" | "phone" | "full_name">;

type MemberFnRow = Fn<"list_device_members">["Returns"][number];
export interface MemberRow {
  user_id: string;
  role: Role;
  added_at: string;
  is_owner: boolean;
  full_name: string;
  email: string | null;
  /** Visible to admins and to the member themself only. */
  phone: MemberFnRow["phone"];
}

export type InvitationRow = Pick<
  Tables<"invitations">,
  | "id"
  | "email"
  | "role"
  | "created_at"
  | "last_sent_at"
  | "expires_at"
  | "accepted_at"
  | "revoked_at"
>;
