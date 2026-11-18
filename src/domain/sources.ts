/**
 * Rules about power sources shared by every screen. Keeping them here (and
 * not inside components) is what keeps the dashboard, the live screen and
 * the logs from disagreeing with each other.
 */
import type { DeviceStatus, SourceId, SourceReport, SystemState } from "../data/types";

export const ALL_SOURCES: readonly SourceId[] = ["grid", "solar", "generator"];

/**
 * Smart mode may pick this source now: inside its limits and, for solar,
 * inside its schedule (the board reports `allowed`). All sources are
 * passive — the board never starts the generator.
 */
export function isSelectable(r: SourceReport | undefined) {
  return Boolean(r?.qualified && r.allowed !== false);
}

/** A manual transfer only needs the source inside its limits (the schedule does not apply). */
export function isUsableManually(r: SourceReport | undefined) {
  return Boolean(r?.qualified);
}

/** Solar delivers power but Smart mode may not use it right now. */
export const outsideSchedule = (r: SourceReport | undefined) =>
  Boolean(r?.qualified && r.allowed === false);

/**
 * Sources physically wired to this board. A source counts as installed
 * unless the board explicitly reports `not_installed`; before the first
 * report every source is shown.
 */
export function installedSources(
  status: Pick<DeviceStatus, "sources"> | null | undefined,
): SourceId[] {
  return ALL_SOURCES.filter((id) => status?.sources?.[id]?.reason !== "not_installed");
}

/**
 * Whether `source` is the one feeding the load. Current and power are
 * measured on the load side, so they belong to a source only in this case.
 * The single rule used by the live tiles, the live chart and the timeline.
 */
export function isFeeding(
  source: SourceId,
  active: SourceId | null | undefined,
  state: SystemState | null | undefined,
): boolean {
  return active === source && state === "normal";
}

/**
 * Which source Smart mode would select right now: the first source in the
 * user's priority order that the board reports as usable. The board makes
 * the real decision (return delay, dwell time); this only powers warnings.
 */
export function predictSmartTarget(
  priority: readonly SourceId[],
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

/** The priority list as shown: installed sources only, in saved order. */
export function visiblePriority(
  priority: readonly SourceId[],
  installed: readonly SourceId[],
): SourceId[] {
  return priority.filter((id) => installed.includes(id));
}

/**
 * Applies a reordering of the visible sources to the full saved priority:
 * the database always stores all three, hidden ones keep their place at
 * the end so they never jump ahead of an installed source.
 */
export function mergePriority(
  visibleOrder: readonly SourceId[],
  full: readonly SourceId[],
): SourceId[] {
  const hidden = full.filter((id) => !visibleOrder.includes(id));
  return [...visibleOrder, ...hidden];
}
