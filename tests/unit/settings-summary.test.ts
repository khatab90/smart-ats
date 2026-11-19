import assert from "node:assert/strict";
import { test } from "vitest";
import type { EditableSettings } from "../../src/data/types";
import { SETTINGS_SECTIONS } from "../../src/store/nav";
import { SECTION_META } from "../../src/features/settings/sections";
import { priorityText, sectionSummary, voltageRange } from "../../src/features/settings/summaries";

const d: EditableSettings = {
  priority: ["solar", "grid", "generator"],
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
const strip = (s: string) => s.replace(/[⁦-⁩]/g, "");

test("every settings section has a title and a summary line", () => {
  for (const s of SETTINGS_SECTIONS) {
    assert.ok(SECTION_META[s].title, s);
    assert.ok(sectionSummary(s, d, ["grid", "solar", "generator"]), s);
  }
});

test("summaries show the values that matter", () => {
  assert.equal(strip(voltageRange(d) ?? ""), "191–253 V");
  assert.equal(strip(sectionSummary("nominal", d, [])), "230 V • 50 Hz");
  assert.match(sectionSummary("nominal", { ...d, nominal_voltage: null }, []), /يجب/);
  // Only installed sources, in priority order.
  assert.equal(priorityText(d.priority, ["grid", "solar"]), "الشمسية ← الشبكة");
});
