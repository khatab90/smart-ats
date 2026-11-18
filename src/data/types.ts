/**
 * Row and payload types shared by the app. They mirror the Supabase schema in
 * supabase/migrations and the ESP32 protocol v1 (docs/ESP32_PROTOCOL.md).
 * Electrical values are nullable: null means "no reading", never "zero".
 */
export type SourceId = "grid" | "solar" | "generator";
export type SystemMode = "smart" | "manual";
export type SystemState = "normal" | "transferring" | "no_source" | "lockout";
export type Role = "admin" | "viewer";
export type Environment = "production" | "test";

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

export interface DeviceStatus {
  device_id: string;
  online: boolean;
  last_seen_at: string | null;
  device_ts: string | null;
  seq: number | null;
  interval_ms: number | null;
  mode: SystemMode | null;
  mode_since: string | null;
  system_state: SystemState | null;
  active_source: SourceId | null;
  active_since: string | null;
  sources: Partial<Record<SourceId, SourceReport>> | null;
  load: LoadReport | null;
  contactors: Partial<Record<SourceId, { cmd: boolean; fb: boolean }>> | null;
  alarms: string[] | null;
  override: {
    active: boolean;
    at?: string | null;
    reason?: string | null;
    requested?: SourceId | null;
  } | null;
  config_version: number | null;
  controller: {
    uptime_s?: number;
    reset_reason?: string;
    temp_c?: number;
    supply_v?: number;
  } | null;
  rssi: number | null;
  runtime: Partial<Record<SourceId, { s: number; since: string | null }>> | null;
}

export interface Device {
  id: string;
  environment: Environment;
  name: string;
  location: string | null;
  owner_id: string | null;
  claimed_at: string | null;
  firmware: string | null;
}

export interface Membership {
  device: Device;
  role: Role;
  isOwner: boolean;
}

export interface DeviceSettings {
  device_id: string;
  version: number;
  priority: SourceId[];
  nominal_voltage: number | null;
  nominal_frequency: number | null;
  uv_trip_pct: number;
  uv_recover_pct: number;
  uv_delay_ms: number;
  ov_trip_pct: number;
  ov_recover_pct: number;
  ov_delay_ms: number;
  uf_trip_pct: number;
  of_trip_pct: number;
  f_recover_pct: number;
  f_delay_ms: number;
  return_delay_s: number;
  min_dwell_s: number;
  rate_limit_count: number;
  rate_limit_window_min: number;
  neutral_delay_ms: number;
  transfer_timeout_ms: number;
  gen_crank_attempts: number;
  gen_warmup_s: number;
  gen_cooldown_s: number;
  grid_capacity_kw: number | null;
  solar_capacity_kw: number | null;
  generator_capacity_kw: number | null;
  max_current_a: number | null;
  manual_revert_min: number | null;
  timezone: string;
  updated_at: string;
}

export type EditableSettings = Omit<DeviceSettings, "device_id" | "version" | "updated_at">;

export interface EventRow {
  id: number;
  device_id: string;
  seq: number | null;
  occurred_at: string;
  origin: "device" | "server" | "app";
  type: string;
  severity: "info" | "warning" | "critical";
  source: SourceId | null;
  from_source: SourceId | null;
  to_source: SourceId | null;
  actor_id: string | null;
  data: Record<string, unknown>;
}

export interface TelemetryRow {
  device_ts: string;
  active_source: SourceId | null;
  system_state: SystemState | null;
  load_voltage: number | null;
  load_current: number | null;
  load_power_w: number | null;
  load_frequency: number | null;
  grid_voltage: number | null;
  grid_frequency: number | null;
  solar_voltage: number | null;
  solar_frequency: number | null;
  generator_voltage: number | null;
  generator_frequency: number | null;
}

export type CommandType = "set_mode" | "set_source" | "reset_runtime";
export type CommandStatus =
  | "pending"
  | "delivered"
  | "accepted"
  | "executing"
  | "completed"
  | "rejected"
  | "failed"
  | "expired";

export interface CommandRow {
  id: string;
  device_id: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  result: { reason?: string; message?: string } | null;
  created_at: string;
  expires_at: string;
}

export type NotificationType =
  | "source_outage"
  | "transfer"
  | "electrical_fault"
  | "connection_lost"
  | "transfer_failed";

export interface NotificationRow {
  id: number;
  device_id: string;
  type: NotificationType;
  critical: boolean;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPrefs {
  transfer: boolean;
  electrical_fault: boolean;
  connection_lost: boolean;
  sound: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
}

export interface MemberRow {
  user_id: string;
  role: Role;
  added_at: string;
  profile: Profile | null;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  last_sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
