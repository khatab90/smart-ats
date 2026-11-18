import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, mayTransfer, smartTarget, stepQualification } from "./logic.mjs";

const S = {
  nominal_voltage: 230,
  nominal_frequency: 60,
  uv_trip_pct: 17,
  uv_recover_pct: 13,
  uv_delay_ms: 2000,
  ov_trip_pct: 10,
  ov_recover_pct: 8,
  ov_delay_ms: 500,
  uf_trip_pct: 4,
  of_trip_pct: 4,
  f_recover_pct: 2,
  f_delay_ms: 1000,
  return_delay_s: 120,
  min_dwell_s: 60,
  rate_limit_count: 3,
  rate_limit_window_min: 10,
};
const fresh = () => ({ qualified: false, badSince: null, goodSince: null, kind: null });

test("classify uses percentages of the configured nominal values", () => {
  assert.equal(classify({ v: 229, f: 60 }, S).ok, true);
  assert.equal(classify({ v: 185, f: 60 }, S).kind, "undervoltage"); // < 190.9
  assert.equal(classify({ v: 255, f: 60 }, S).kind, "overvoltage"); // > 253
  assert.equal(classify({ v: 229, f: 57 }, S).kind, "underfrequency"); // < 57.6
  assert.equal(classify({ v: 0, f: 0 }, S).kind, "no_voltage");
  assert.equal(classify({ v: 198, f: 60 }, S).recovered, false); // inside trip, outside recover band
});

test("undervoltage trips only after its delay; loss of voltage trips immediately", () => {
  let q = { ...fresh(), qualified: true };
  let r = stepQualification(q, { v: 180, f: 60 }, S, 0, true);
  assert.equal(r.q.qualified, true);
  r = stepQualification(r.q, { v: 180, f: 60 }, S, 1999, true);
  assert.equal(r.q.qualified, true);
  r = stepQualification(r.q, { v: 180, f: 60 }, S, 2000, true);
  assert.equal(r.tripped, true);
  q = { ...fresh(), qualified: true };
  assert.equal(stepQualification(q, { v: 0, f: 0 }, S, 0, true).tripped, true);
});

test("a returning source must be stable for the whole return delay", () => {
  let r = stepQualification(fresh(), { v: 230, f: 60 }, S, 0, false);
  assert.equal(r.q.qualified, false);
  r = stepQualification(r.q, { v: 230, f: 60 }, S, 60_000, false);
  r = stepQualification(r.q, { v: 0, f: 0 }, S, 61_000, false); // blip restarts the timer
  r = stepQualification(r.q, { v: 230, f: 60 }, S, 62_000, false);
  r = stepQualification(r.q, { v: 230, f: 60 }, S, 62_000 + 119_000, false);
  assert.equal(r.q.qualified, false);
  r = stepQualification(r.q, { v: 230, f: 60 }, S, 62_000 + 120_000, false);
  assert.equal(r.q.qualified, true);
});

test("smart target follows the user priority", () => {
  const qual = {
    grid: { qualified: false },
    solar: { qualified: true },
    generator: { qualified: true },
  };
  assert.equal(smartTarget(["grid", "solar", "generator"], qual), "solar");
  assert.equal(smartTarget(["generator", "grid", "solar"], qual), "generator");
  assert.equal(smartTarget(["grid"], { grid: { qualified: false } }), null);
});

test("dwell time and rate limit block voluntary transfers, never escapes from a failed source", () => {
  const base = {
    active: "solar",
    target: "grid",
    activeSince: 0,
    settings: S,
    recentTransfers: [],
  };
  assert.equal(mayTransfer({ ...base, activeQualified: true, now: 30_000 }).reason, "dwell");
  assert.equal(mayTransfer({ ...base, activeQualified: false, now: 30_000 }).ok, true);
  const busy = [100_000, 200_000, 300_000];
  assert.equal(
    mayTransfer({ ...base, activeQualified: true, now: 400_000, recentTransfers: busy }).reason,
    "rate_limit",
  );
  assert.equal(
    mayTransfer({ ...base, activeQualified: false, now: 400_000, recentTransfers: busy }).ok,
    true,
  );
});
