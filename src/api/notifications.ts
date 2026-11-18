import type { NotificationPrefs, NotificationRow } from "../data/types";
import { supabase, type RealtimeUnsubscribe } from "./client";
import { asRow, run } from "./result";

const COLUMNS = "id, device_id, type, critical, title, body, params, created_at, read_at";
const PREF_COLUMNS =
  "source_outage, transfer, electrical_fault, connection_lost, transfer_failed, sound";

export const listNotifications = () =>
  run(
    supabase
      .from("notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200),
    (rows) => rows.map((r) => asRow<NotificationRow>(r)),
  );

export const getPreferences = () =>
  run(
    supabase.from("notification_preferences").select(PREF_COLUMNS).maybeSingle(),
    (d) => d as NotificationPrefs | null,
  );

export const savePreferences = (userId: string, prefs: NotificationPrefs) =>
  run(
    supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }),
    () => null,
  );

export const markRead = (id: number, at: string) =>
  run(
    supabase.from("notifications").update({ read_at: at }).eq("id", id).is("read_at", null),
    () => null,
  );

export const markAllRead = (userId: string, at: string) =>
  run(
    supabase
      .from("notifications")
      .update({ read_at: at })
      .eq("user_id", userId)
      .is("read_at", null),
    () => null,
  );

export const deleteNotification = (id: number) =>
  run(supabase.from("notifications").delete().eq("id", id), () => null);

export function subscribeNotifications(
  userId: string,
  onInsert: (row: NotificationRow) => void,
): RealtimeUnsubscribe {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (p) => onInsert(asRow<NotificationRow>(p.new)),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
