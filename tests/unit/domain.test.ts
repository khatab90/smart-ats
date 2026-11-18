import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { DeviceStatus, EditableSettings, NotificationRow } from "../../src/data/types";
import { notificationText } from "../../src/domain/notifications";
import { validateSettings } from "../../src/domain/settings";
import {
  installedSources,
  isFeeding,
  isSelectable,
  isUsableManually,
  mergePriority,
  outsideSchedule,
  visiblePriority,
} from "../../src/domain/sources";

const status = (sources: DeviceStatus["sources"]) => ({ sources }) as Pick<DeviceStatus, "sources">;

describe("installed sources", () => {
  test("every source is shown until the board reports otherwise", () => {
    assert.deepEqual(installedSources(null), ["grid", "solar", "generator"]);
  });
  test("not_installed sources are hidden everywhere", () => {
    const s = status({
      grid: { v: 230, f: 50 },
      solar: { v: null, f: null, reason: "not_installed" },
      generator: { v: 0, f: 0 },
    });
    assert.deepEqual(installedSources(s), ["grid", "generator"]);
  });
});

describe("priority with hidden sources", () => {
  test("only installed sources are listed, in saved order", () => {
    assert.deepEqual(visiblePriority(["solar", "generator", "grid"], ["grid", "generator"]), [
      "generator",
      "grid",
    ]);
  });
  test("reordering the visible list keeps hidden sources at the end", () => {
    assert.deepEqual(mergePriority(["grid", "generator"], ["solar", "generator", "grid"]), [
      "grid",
      "generator",
      "solar",
    ]);
  });
});

describe("passive sources and the solar schedule", () => {
  test("Smart mode needs the source inside its limits and allowed by the schedule", () => {
    assert.equal(isSelectable({ v: 230, f: 50, qualified: true }), true);
    assert.equal(isSelectable({ v: 230, f: 50, qualified: true, allowed: false }), false);
    assert.equal(isSelectable({ v: 0, f: 0, qualified: false, reason: "no_voltage" }), false);
  });
  test("a stopped generator is simply unavailable (the board never starts it)", () => {
    assert.equal(isSelectable({ v: 0, f: 0, qualified: false, reason: "no_voltage" }), false);
  });
  test("a manual transfer ignores the schedule", () => {
    assert.equal(isUsableManually({ v: 230, f: 50, qualified: true, allowed: false }), true);
    assert.equal(outsideSchedule({ v: 230, f: 50, qualified: true, allowed: false }), true);
    assert.equal(outsideSchedule({ v: 230, f: 50, qualified: true }), false);
  });
});

describe("feeding rule (one rule for tiles, chart and timeline)", () => {
  test("a source feeds the load only while active and the system is normal", () => {
    assert.equal(isFeeding("grid", "grid", "normal"), true);
    assert.equal(isFeeding("grid", "grid", "lockout"), false);
    assert.equal(isFeeding("grid", "grid", "transferring"), false);
    assert.equal(isFeeding("grid", "solar", "normal"), false);
  });
});

describe("notification text from params", () => {
  const n = (params: NotificationRow["params"], type: NotificationRow["type"] = "transfer") =>
    notificationText({ type, title: "fallback", body: "fallback body", params });
  test("transfer names both sources and the device", () => {
    assert.deepEqual(n({ event: "transfer", from: "grid", to: "solar", device: "المنزل" }), {
      title: "تحويل بين المصادر",
      body: "تم التحويل من الشبكة الوطنية إلى الطاقة الشمسية في «المنزل».",
    });
  });
  test("a failed transfer explains why", () => {
    assert.match(
      n({ event: "transfer_failed", to: "solar", reason: "close_failed" }, "transfer_failed").body,
      /الكونتاكتور/,
    );
  });
  test("old rows without params fall back to the stored text", () => {
    assert.deepEqual(n({}), { title: "fallback", body: "fallback body" });
  });
});

describe("settings cross-field rules", () => {
  const base: EditableSettings = {
    priority: ["grid", "solar", "generator"],
    nominal_voltage: 230,
    nominal_frequency: 50,
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
    rate_limit_count: 6,
    rate_limit_window_min: 10,
    neutral_delay_ms: 1000,
    transfer_timeout_ms: 5000,
    manual_revert_min: null,
    timezone: "Asia/Baghdad",
    solar_schedule: { enabled: false, periods: [] },
  };
  test("defaults are valid", () => assert.equal(validateSettings(base), null));
  test("recover band must be inside the trip band", () => {
    assert.match(validateSettings({ ...base, uv_recover_pct: 17 }) ?? "", /الرجوع/);
  });
  test("an enabled schedule needs at least one period", () => {
    assert.match(
      validateSettings({ ...base, solar_schedule: { enabled: true, periods: [] } }) ?? "",
      /فترة/,
    );
  });
  test("an invalid time zone is rejected", () => {
    assert.match(validateSettings({ ...base, timezone: "Mars/Base" }) ?? "", /المنطقة الزمنية/);
  });
});
