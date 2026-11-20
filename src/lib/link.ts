import type { DeviceStatus } from "../data/types";

/**
 * Connection state derived from the server receive time of the last board
 * message (A7): stale after ~3 missed updates, offline after 30 s or when the
 * server watchdog has already flagged the board.
 */
export type LinkState = "never" | "live" | "stale" | "offline";

const OFFLINE_AFTER_MS = 30_000;

export function classifyLink(
  status: Pick<DeviceStatus, "online" | "last_seen_at" | "interval_ms"> | null,
  serverNowMs: number,
): { state: LinkState; ageMs: number | null } {
  if (!status || !status.last_seen_at) return { state: "never", ageMs: null };
  const seen = Date.parse(status.last_seen_at);
  if (!Number.isFinite(seen)) return { state: "never", ageMs: null };
  const ageMs = Math.max(0, serverNowMs - seen);
  if (!status.online || ageMs > OFFLINE_AFTER_MS) return { state: "offline", ageMs };
  const interval = status.interval_ms && status.interval_ms > 0 ? status.interval_ms : 2000;
  if (ageMs > Math.max(3 * interval, 6000)) return { state: "stale", ageMs };
  return { state: "live", ageMs };
}
