// Regressions found while testing against the real database (v2.1.2).
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { transferReasonText } from "../../src/data/meta";
import type { EventRow } from "../../src/data/types";
import { isSwitch } from "../../src/features/logs/SwitchLog";
import { changedFields, sameValue } from "../../src/domain/settings";
import type { EditableSettings } from "../../src/data/types";
import { arCount, fmtDuration, initialOf } from "../../src/lib/format";
import { formatTick, niceStep, ticksFor, yDomain } from "../../src/lib/series";
import {
  buildTimeline,
  durationsBy,
  latestBefore,
  toTimelineEvent,
  withOfflineGaps,
  type TimelineEvent,
} from "../../src/lib/timeline";

describe("settings form", () => {
  const base = {
    nominal_voltage: 230,
    priority: ["grid", "solar", "generator"],
    solar_schedule: { enabled: true, periods: [{ end: "23:00", days: [0, 1], start: "18:00" }] },
  } as unknown as EditableSettings;

  test("only touched fields that differ are sent", () => {
    assert.deepEqual(changedFields(base, {}), {});
    assert.deepEqual(changedFields(base, { nominal_voltage: 230 }), {});
    assert.deepEqual(changedFields(base, { nominal_voltage: 220 }), { nominal_voltage: 220 });
  });

  test("a schedule equal except for key order is not a change (jsonb reorders keys)", () => {
    const same = { enabled: true, periods: [{ days: [0, 1], start: "18:00", end: "23:00" }] };
    assert.equal(sameValue(same, base.solar_schedule), true);
    assert.deepEqual(changedFields(base, { solar_schedule: same } as never), {});
  });
});

describe("chart axes", () => {
  test("voltage keeps the safe band in view instead of starting at 0", () => {
    const samples = [229, 230, 231].map((v, i) => ({ t: i, v }));
    const [lo, hi] = yDomain(samples, undefined, { min: 191, max: 253 });
    assert.ok(lo < 191 && lo > 150, `lo=${lo}`);
    assert.ok(hi > 253 && hi < 280, `hi=${hi}`);
  });

  test("an outage (0 V) still stretches the voltage scale to 0", () => {
    const [lo] = yDomain(
      [
        { t: 0, v: 230 },
        { t: 1, v: 0 },
      ],
      undefined,
      { min: 191, max: 253 },
    );
    assert.ok(lo <= 0);
  });

  test("neighbouring ticks never print the same text", () => {
    for (const [lo, hi] of [
      [0, 0.1],
      [0, 0.15],
      [0, 3],
      [180, 260],
      [49.9, 50.1],
      [0, 2500],
    ] as const) {
      const ticks = ticksFor(lo, hi, 3);
      const step = ticks[1]! - ticks[0]!;
      const text = ticks.map((t) => formatTick(t, step));
      assert.equal(new Set(text).size, text.length, `${lo}–${hi}: ${text.join(", ")}`);
      assert.ok(ticks.every((t) => t >= lo - 1e-9 && t <= hi + 1e-9));
    }
    assert.equal(niceStep(0.033), 0.05);
    assert.deepEqual(
      ticksFor(0, 0.15).map((t) => formatTick(t, 0.05)),
      ["0.00", "0.05", "0.10", "0.15"],
    );
  });
});

describe("runtime history across board restarts", () => {
  const H = 3_600_000;
  const ev = (t: number, type: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
    t,
    type,
    to: null,
    ...extra,
  });

  test("a board that was off does not credit the gap to the last source", () => {
    const events = [
      ev(1 * H, "transfer_completed", { to: "solar" }),
      ev(2 * H, "connection_lost"),
      ev(40 * H, "controller_restarted", { active: "grid" }),
      ev(40 * H + 60_000, "connection_restored"),
    ];
    const d = durationsBy(buildTimeline(events, "grid", 0, 41 * H), 0, 41 * H);
    assert.equal(d.solar, 1 * H);
    assert.equal(d.unknown, 38 * H);
    assert.equal(d.grid, 1 * H + 1 * H);
  });

  test("a network-only outage keeps the source running (buffered events replayed)", () => {
    const events = [
      ev(1 * H, "transfer_completed", { to: "solar" }),
      ev(2 * H, "connection_lost"),
      ev(3 * H, "connection_restored"),
    ];
    const d = durationsBy(buildTimeline(events, "grid", 0, 4 * H), 0, 4 * H);
    assert.equal(d.solar, 3 * H);
    assert.equal(d.unknown, 0);
  });

  test("still offline: the time since the board went silent is unknown", () => {
    const kept = withOfflineGaps([ev(1, "connection_lost")]);
    assert.equal(kept.length, 1);
    const d = durationsBy(buildTimeline([ev(H, "connection_lost")], "grid", 0, 3 * H), 0, 3 * H);
    assert.equal(d.grid, H);
    assert.equal(d.unknown, 2 * H);
  });

  test("boot without a source, or an old board that does not report one", () => {
    const none = toTimelineEvent({
      occurred_at: new Date(0).toISOString(),
      type: "controller_restarted",
      to_source: null,
      data: { reason: "power_on", active: null },
    });
    assert.equal(none.active, null);
    const old = toTimelineEvent({
      occurred_at: new Date(0).toISOString(),
      type: "controller_restarted",
      to_source: null,
      data: { reason: "power_on" },
    });
    assert.equal(old.active, undefined);
    const d = durationsBy(buildTimeline([{ ...none, t: H }], "grid", 0, 2 * H), 0, 2 * H);
    assert.equal(d.none, H);
  });

  test("previous source duration starts at the last boot when it is later", () => {
    assert.equal(latestBefore([10, 50, 90], 60), 50);
    assert.equal(latestBefore([70], 60), null);
  });
});

test("transfer reasons from the board are readable; unknown ones are hidden", () => {
  assert.equal(transferReasonText("no_voltage"), "انقطاع الجهد");
  assert.equal(transferReasonText("source_restored"), "عودة مصدر بعد انقطاع كلي");
  assert.equal(transferReasonText("priority_return"), "عودة المصدر الأعلى أولوية");
  assert.equal(transferReasonText("something_new"), null);
  assert.equal(transferReasonText(undefined), null);
});

test("Arabic counts and avatar letters", () => {
  const f = { one: "جهاز واحد", two: "جهازان", few: "أجهزة", many: "جهازاً", base: "جهاز" };
  assert.equal(arCount(1, f), "جهاز واحد");
  assert.equal(arCount(2, f), "جهازان");
  assert.equal(arCount(3, f), "3 أجهزة");
  assert.equal(arCount(10, f), "10 أجهزة");
  assert.equal(arCount(11, f), "11 جهازاً");
  assert.equal(arCount(100, f), "100 جهاز");
  assert.equal(initialOf("خطاب أحمد", "k@x.com"), "خ");
  assert.equal(initialOf("", "claude-tester@example.com"), "C");
  assert.equal(initialOf(null, null), "؟");
});

test("the end of a total outage is not counted as a switch in the timing averages", () => {
  const e = (from: string | null, to: string, reason: string) =>
    ({ from_source: from, to_source: to, data: { reason } }) as unknown as EventRow;
  assert.equal(isSwitch(e("grid", "solar", "no_voltage")), true);
  assert.equal(isSwitch(e(null, "grid", "source_restored")), false);
  assert.equal(isSwitch(e("grid", "grid", "no_voltage")), false); // older boards
});

test("short durations read in seconds, longer ones in hours and minutes", () => {
  assert.equal(fmtDuration(18_200), "18 ث");
  assert.equal(fmtDuration(0), "0 ث");
  assert.equal(fmtDuration(125_000), "2 د");
  assert.equal(fmtDuration(40 * 3_600_000 + 23 * 60_000), "40 س 23 د");
});
