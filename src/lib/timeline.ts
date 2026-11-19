import type { SourceId } from "../data/types";

/**
 * Reconstructs which source fed the load from the event log. Transfer and
 * blackout periods are "none" (never credited to a source, C6); time before
 * the first known event is "unknown".
 *
 * Offline periods: a board that only lost the network keeps running and
 * replays its buffered events with their original timestamps, so the source
 * it was on continues through the gap. A board that was switched off or
 * rebooted cannot tell what happened while it was down: from the moment the
 * server noticed the silence (connection_lost) until it booted again
 * (controller_restarted) the state is "unknown", and after booting it is the
 * source it reports in controller_restarted.data.active.
 */
export type FeedState = SourceId | "none" | "unknown";

export interface TimelineEvent {
  t: number;
  type: string;
  to: SourceId | null;
  /** controller_restarted only: source feeding the load after boot (null = none, undefined = not reported). */
  active?: SourceId | null;
}

/** Event types the timeline reads (state changes plus offline markers). */
export const TIMELINE_EVENT_TYPES = [
  "transfer_started",
  "transfer_completed",
  "no_source_started",
  "no_source_ended",
  "controller_restarted",
  "connection_lost",
  "connection_restored",
];

/**
 * Keeps a connection_lost marker only when the board was really down: it
 * rebooted before the connection came back, or it has not come back yet.
 * connection_restored itself changes nothing and is dropped.
 */
export function withOfflineGaps(eventsAsc: TimelineEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  eventsAsc.forEach((e, i) => {
    if (e.type === "connection_restored") return;
    if (e.type === "connection_lost") {
      const rest = eventsAsc.slice(i + 1);
      const back = rest.findIndex((x) => x.type === "connection_restored");
      const reboot = rest.findIndex((x) => x.type === "controller_restarted");
      const keep = back === -1 || (reboot !== -1 && reboot < back);
      if (!keep) return;
    }
    out.push(e);
  });
  return out;
}

const SOURCES: readonly SourceId[] = ["grid", "solar", "generator"];

/** Converts a stored event into the timeline's shape. */
export function toTimelineEvent(e: {
  occurred_at: string;
  type: string;
  to_source: SourceId | null;
  data: unknown;
}): TimelineEvent {
  const ev: TimelineEvent = { t: Date.parse(e.occurred_at), type: e.type, to: e.to_source };
  const data = e.data && typeof e.data === "object" ? (e.data as Record<string, unknown>) : {};
  if (e.type === "controller_restarted" && "active" in data) {
    ev.active = SOURCES.includes(data.active as SourceId) ? (data.active as SourceId) : null;
  }
  return ev;
}

/** Latest of `times` strictly before `t`, or null. */
export function latestBefore(times: number[], t: number): number | null {
  let best: number | null = null;
  for (const x of times) if (x < t && (best === null || x > best)) best = x;
  return best;
}

export interface Segment {
  start: number;
  end: number;
  state: FeedState;
}

export function stateAfter(e: TimelineEvent | null, fallback: FeedState = "unknown"): FeedState {
  if (!e) return fallback;
  if (e.type === "transfer_completed" && e.to) return e.to;
  if (e.type === "connection_lost") return "unknown";
  if (e.type === "controller_restarted") {
    return e.active === undefined ? "unknown" : (e.active ?? "none");
  }
  if (
    e.type === "transfer_started" ||
    e.type === "no_source_started" ||
    e.type === "no_source_ended"
  )
    return "none";
  return fallback;
}

export function buildTimeline(
  eventsAsc: TimelineEvent[],
  initial: FeedState,
  from: number,
  to: number,
): Segment[] {
  const segs: Segment[] = [];
  let state = initial;
  let cursor = from;
  for (const e of withOfflineGaps(eventsAsc)) {
    if (e.t < from) {
      state = stateAfter(e, state);
      continue;
    }
    if (e.t >= to) break;
    if (e.t > cursor) segs.push({ start: cursor, end: e.t, state });
    cursor = Math.max(cursor, e.t);
    state = stateAfter(e, state);
  }
  if (to > cursor) segs.push({ start: cursor, end: to, state });
  // merge neighbours with the same state
  return segs.reduce<Segment[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.state === s.state && last.end === s.start) last.end = s.end;
    else acc.push({ ...s });
    return acc;
  }, []);
}

export function durationsBy(segs: Segment[], from: number, to: number): Record<FeedState, number> {
  const out: Record<FeedState, number> = { grid: 0, solar: 0, generator: 0, none: 0, unknown: 0 };
  for (const s of segs) {
    const a = Math.max(s.start, from);
    const b = Math.min(s.end, to);
    if (b > a) out[s.state] += b - a;
  }
  return out;
}
