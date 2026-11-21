// Formatting rules added in 2.14.0 (Arabic, the default language in tests).
import assert from "node:assert/strict";
import { test } from "vitest";
import { fmtHour, fmtMs } from "../../src/lib/format.ts";
import { isValidTimeZone, phoneTimeZone } from "../../src/lib/tz.ts";

test("fmtHour: 12-hour clock with ص / م, midnight and noon are 12", () => {
  assert.equal(fmtHour(0), "12 ص");
  assert.equal(fmtHour(6), "6 ص");
  assert.equal(fmtHour(12), "12 م");
  assert.equal(fmtHour(18), "6 م");
  assert.equal(fmtHour(24), "12 ص");
});

test("fmtMs: milliseconds under a second, seconds with one decimal above", () => {
  assert.equal(fmtMs(42), "42 ملي ثانية");
  assert.equal(fmtMs(1000), "1.0 ث");
  assert.equal(fmtMs(1250), "1.3 ث");
});

test("phoneTimeZone: a valid IANA name the settings validation accepts", () => {
  const tz = phoneTimeZone();
  assert.ok(tz === null || isValidTimeZone(tz));
});
