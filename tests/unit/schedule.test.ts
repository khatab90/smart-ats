// The app's schedule rule runs the same shared vectors as the board.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import {
  describePeriod,
  localClock,
  solarAllowedAt,
  validateSchedule,
  type SolarSchedule,
} from "../../src/domain/schedule";

const V = JSON.parse(
  readFileSync(new URL("../../protocol/logic-vectors.json", import.meta.url), "utf8"),
) as {
  schedule: { name: string; schedule: SolarSchedule; checks: [number, number, boolean][] }[];
};

describe("solar schedule (shared vectors)", () => {
  for (const c of V.schedule) {
    test(c.name, () => {
      for (const [wd, min, allowed] of c.checks)
        assert.equal(solarAllowedAt(c.schedule, wd, min), allowed);
    });
  }
});

test("local clock in an IANA zone", () => {
  assert.deepEqual(localClock(Date.parse("2026-11-18T22:30:00Z"), "Asia/Baghdad"), {
    weekday: 4,
    minutes: 90,
  });
});

test("validation mirrors the database rules", () => {
  assert.equal(validateSchedule({ enabled: false, periods: [] }), null);
  assert.match(validateSchedule({ enabled: true, periods: [] }) ?? "", /فترة واحدة/);
  assert.match(
    validateSchedule({ enabled: true, periods: [{ days: [], start: "08:00", end: "17:00" }] }) ??
      "",
    /يوماً/,
  );
  assert.match(
    validateSchedule({ enabled: true, periods: [{ days: [1], start: "08:00", end: "08:00" }] }) ??
      "",
    /يساوي/,
  );
});

test("periods are described in Arabic, Saturday first", () => {
  assert.equal(
    describePeriod({ days: [0, 1, 2, 3, 4, 5, 6], start: "08:00", end: "17:00" }),
    "كل الأيام 08:00 – 17:00",
  );
  assert.equal(
    describePeriod({ days: [5, 6], start: "20:00", end: "02:00" }),
    "سبت، جمعة 20:00 – 02:00 (حتى اليوم التالي)",
  );
});
