import type { SourceId } from "../data/types";

/**
 * Reconstructs which source fed the load from the event log. Transfer and
 * blackout periods are "none" (never credited to a source, C6); time before
 * the first known event is "unknown". Buffered events replayed by the board
 * after a disconnection carry their original timestamps, so offline periods
 * are reconstructed too.
 */
export type FeedState = SourceId | "none" | "unknown";

export interface TimelineEvent {
  t: number;
  type: string;
  to: SourceId | null;
}

export interface Segment {
  start: number;
  end: number;
  state: FeedState;
}

export function stateAfter(e: TimelineEvent | null, fallback: FeedState = "unknown"): FeedState {
  if (!e) return fallback;
  if (e.type === "transfer_completed" && e.to) return e.to;
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
  for (const e of eventsAsc) {
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
