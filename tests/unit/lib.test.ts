// Pure app logic. Run: node --experimental-strip-types --test tests/*.test.ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { classifyLink } from "../../src/lib/link.ts";
import { seriesStats, splitSegments, yDomain } from "../../src/lib/series.ts";
import { movePriority, predictSmartTarget } from "../../src/domain/sources.ts";
import { buildTimeline, durationsBy, stateAfter } from "../../src/lib/timeline.ts";
import { addDaysInTz, startOfDayInTz } from "../../src/lib/tz.ts";

const T = Date.parse("2026-11-16T12:00:00Z");

test("link: never, live, stale after ~3 intervals, offline after 30 s or watchdog", () => {
  assert.equal(classifyLink(null, T).state, "never");
  assert.equal(
    classifyLink({ online: false, last_seen_at: null, interval_ms: 2000 }, T).state,
    "never",
  );
  const seen = (ms: number) => new Date(T - ms).toISOString();
  assert.equal(
    classifyLink({ online: true, last_seen_at: seen(3000), interval_ms: 2000 }, T).state,
    "live",
  );
  assert.equal(
    classifyLink({ online: true, last_seen_at: seen(7000), interval_ms: 2000 }, T).state,
    "stale",
  );
  assert.equal(
    classifyLink({ online: true, last_seen_at: seen(31_000), interval_ms: 2000 }, T).state,
    "offline",
  );
  assert.equal(
    classifyLink({ online: false, last_seen_at: seen(1000), interval_ms: 2000 }, T).state,
    "offline",
  );
});

test("smart prediction follows the user priority over qualified sources only", () => {
  const sources = {
    grid: { v: 0, f: 0, qualified: false },
    solar: { v: 230, f: 50, qualified: true },
    generator: { v: 0, f: 0 },
  };
  assert.equal(predictSmartTarget(["grid", "solar", "generator"], sources), "solar");
  assert.equal(predictSmartTarget(["generator", "grid"], sources), null);
  // A stopped generator is not selectable (the board never starts it) …
  assert.equal(predictSmartTarget(["generator", "solar"], sources), "solar");
  // … and solar outside its schedule is skipped by Smart mode.
  const night = { ...sources, solar: { ...sources.solar, allowed: false } };
  assert.equal(predictSmartTarget(["solar", "grid", "generator"], night), null);
  assert.deepEqual(movePriority(["grid", "solar", "generator"], 2, 0), [
    "generator",
    "grid",
    "solar",
  ]);
  assert.deepEqual(movePriority(["grid", "solar", "generator"], 0, 5), [
    "grid",
    "solar",
    "generator",
  ]);
});

test("series: null and long gaps split the line; zeros count in statistics", () => {
  const s = [
    { t: 0, v: 230 },
    { t: 2000, v: 231 },
    { t: 4000, v: null },
    { t: 6000, v: 0 },
    { t: 8000, v: 0 },
    { t: 30_000, v: 229 },
  ];
  const segs = splitSegments(s, 6000);
  assert.equal(segs.length, 3);
  assert.deepEqual(
    segs[1].map((p) => p.v),
    [0, 0],
  );
  const st = seriesStats(s)!;
  assert.equal(st.min, 0);
  assert.equal(st.max, 231);
  const [lo, hi] = yDomain(s, 0);
  assert.ok(lo <= 0 && hi >= 231);
  assert.equal(seriesStats([{ t: 0, v: null }]), null);
});

test("time zones: local midnight and day stepping", () => {
  const riyadh = startOfDayInTz(T, "Asia/Riyadh"); // UTC+3
  assert.equal(new Date(riyadh).toISOString(), "2026-11-15T21:00:00.000Z");
  assert.equal(addDaysInTz(T, -1, "Asia/Riyadh"), riyadh - 86_400_000);
  const ny = Date.parse("2026-03-08T15:00:00Z"); // DST change day in New York
  const day = startOfDayInTz(ny, "America/New_York");
  assert.equal(new Date(day).toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(
    new Date(addDaysInTz(day, 1, "America/New_York")).toISOString(),
    "2026-03-09T04:00:00.000Z",
  );
});

test("timeline never credits transfers or blackouts to a source", () => {
  const h = 3_600_000;
  const events = [
    { t: 2 * h, type: "transfer_started", to: "solar" as const },
    { t: 2 * h + 2000, type: "transfer_completed", to: "solar" as const },
    { t: 5 * h, type: "no_source_started", to: null },
    { t: 6 * h, type: "no_source_ended", to: null },
    { t: 6 * h + 2000, type: "transfer_completed", to: "generator" as const },
  ];
  const segs = buildTimeline(events, "grid", 0, 8 * h);
  const d = durationsBy(segs, 0, 8 * h);
  assert.equal(d.grid, 2 * h);
  assert.equal(d.solar, 3 * h - 2000);
  assert.equal(d.none, h + 4000);
  assert.equal(d.generator, 2 * h - 2000);
  assert.equal(stateAfter(null), "unknown");
  assert.equal(durationsBy(buildTimeline([], "unknown", 0, h), 0, h).unknown, h);
});
