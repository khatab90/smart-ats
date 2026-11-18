// The app's settings schema (src/domain/settings.ts) and the database CHECK
// constraints must agree on every limit. This test walks each field's
// boundaries against the real migrations.
import assert from "node:assert/strict";
import { beforeAll, describe, test } from "vitest";
import { NOMINAL_FREQUENCIES, NOMINAL_VOLTAGES, SETTINGS_GROUPS } from "../../src/domain/settings";
// @ts-expect-error — plain JS test harness
import { createDb, U1 } from "./harness.mjs";

type Harness = {
  as: (u: string | null, e?: string) => Promise<void>;
  db: { query: (sql: string, p?: unknown[]) => Promise<unknown> };
  users: (l: string[][]) => Promise<void>;
  board: (id: string, owner: string, email: string) => Promise<unknown>;
};
let h: Harness;

// Fields constrained against a partner: relax the partner for the test.
const PARTNER: Record<string, string> = {
  uv_trip_pct: "uv_recover_pct = 2",
  uv_recover_pct: "uv_trip_pct = 30",
  ov_trip_pct: "ov_recover_pct = 1",
  ov_recover_pct: "ov_trip_pct = 25",
  uf_trip_pct: "f_recover_pct = 0.5",
  of_trip_pct: "f_recover_pct = 0.5",
  f_recover_pct: "uf_trip_pct = 10, of_trip_pct = 10",
};

async function accepts(set: string) {
  try {
    await h.db.query(`update public.device_settings set ${set} where device_id = 'ATS-SET001'`);
    return true;
  } catch (e) {
    if (/check constraint/.test((e as Error).message)) return false;
    throw e;
  } finally {
    await h.db.query(
      `update public.device_settings set uv_trip_pct = 17, uv_recover_pct = 13, ov_trip_pct = 10, ov_recover_pct = 8,
       uf_trip_pct = 4, of_trip_pct = 4, f_recover_pct = 2 where device_id = 'ATS-SET001'`,
    );
  }
}

beforeAll(async () => {
  h = (await createDb()) as Harness;
  await h.users([[U1, "owner@x.io", "Owner"]]);
  await h.board("ATS-SET001", U1, "owner@x.io");
  await h.as(null);
});

describe("numeric limits match the database", () => {
  for (const f of SETTINGS_GROUPS.flatMap((g) => g.fields)) {
    test(`${f.key}: [${f.min}, ${f.max}]`, async () => {
      const eps = f.step ?? 1;
      const partner = PARTNER[f.key] ? `${PARTNER[f.key]}, ` : "";
      assert.equal(await accepts(`${partner}${f.key} = ${f.min}`), true, "min accepted");
      assert.equal(await accepts(`${partner}${f.key} = ${f.max}`), true, "max accepted");
      assert.equal(
        await accepts(`${partner}${f.key} = ${f.min - eps}`),
        false,
        "below min rejected",
      );
      assert.equal(
        await accepts(`${partner}${f.key} = ${f.max + eps}`),
        false,
        "above max rejected",
      );
      if (f.optional) assert.equal(await accepts(`${f.key} = null`), true, "null accepted");
    });
  }
});

describe("nominal values match the database", () => {
  test("every app option is accepted, others rejected", async () => {
    for (const v of NOMINAL_VOLTAGES) assert.equal(await accepts(`nominal_voltage = ${v}`), true);
    for (const v of NOMINAL_FREQUENCIES)
      assert.equal(await accepts(`nominal_frequency = ${v}`), true);
    assert.equal(await accepts("nominal_voltage = 110"), false);
    assert.equal(await accepts("nominal_frequency = 55"), false);
  });
});
