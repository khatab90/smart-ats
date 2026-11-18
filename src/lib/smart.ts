import type { SourceId, SourceReport } from "../data/types";

/** Usable now: qualified, or a stopped generator the board reports as ready to start. */
export function isSelectable(r: SourceReport | undefined) {
  return Boolean(r?.qualified || r?.reason === "standby");
}

/**
 * Which source Smart mode would select right now: the first source in the
 * user's priority order that the board reports as usable. The board makes
 * the real decision (return delay, dwell time); this only powers warnings.
 */
export function predictSmartTarget(
  priority: SourceId[],
  sources: Partial<Record<SourceId, SourceReport>> | null | undefined,
): SourceId | null {
  for (const id of priority) {
    if (isSelectable(sources?.[id])) return id;
  }
  return null;
}

export function movePriority(priority: SourceId[], from: number, to: number): SourceId[] {
  const next = [...priority];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
