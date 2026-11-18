import type { CommandRow, DeviceSettings, DeviceStatus, EventRow, TelemetryRow } from "../data/types";
import { supabase, type RealtimeUnsubscribe } from "./client";
import { asRow } from "./result";

export type ChannelState = "connecting" | "live" | "polling";

/** Live changes for one device: status, settings, new events, command lifecycle. */
export function subscribeDevice(
  deviceId: string,
  handlers: {
    status: (row: DeviceStatus) => void;
    settings: (row: DeviceSettings) => void;
    event: (row: EventRow) => void;
    command: (row: CommandRow) => void;
    state: (s: ChannelState) => void;
  },
): RealtimeUnsubscribe {
  const filter = `device_id=eq.${deviceId}`;
  const channel = supabase
    .channel(`device:${deviceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "device_status", filter }, (p) => {
      if (p.new && "device_id" in p.new) handlers.status(asRow<DeviceStatus>(p.new));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "device_settings", filter }, (p) => {
      if (p.new && "device_id" in p.new) handlers.settings(asRow<DeviceSettings>(p.new));
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter }, (p) =>
      handlers.event(asRow<EventRow>(p.new)),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "device_commands", filter }, (p) => {
      if (p.new && "id" in p.new) handlers.command(asRow<CommandRow>(p.new));
    })
    .subscribe((state) => {
      if (state === "SUBSCRIBED") handlers.state("live");
      else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") handlers.state("polling");
    });
  return () => void supabase.removeChannel(channel);
}

export function subscribeTelemetry(
  deviceId: string,
  onRow: (row: TelemetryRow) => void,
  onSubscribed: () => void,
): RealtimeUnsubscribe {
  const channel = supabase
    .channel(`telemetry:${deviceId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "telemetry", filter: `device_id=eq.${deviceId}` },
      (p) => onRow(asRow<TelemetryRow>(p.new)),
    )
    .subscribe((state) => {
      if (state === "SUBSCRIBED") onSubscribed();
    });
  return () => void supabase.removeChannel(channel);
}

export function subscribeMemberships(userId: string, onChange: () => void): RealtimeUnsubscribe {
  const channel = supabase
    .channel(`members:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "device_members", filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
