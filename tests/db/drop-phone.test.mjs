// Migration 6: phone numbers are gone from the database.
import assert from "node:assert/strict";
import { test } from "vitest";
import { createDb } from "./harness.mjs";

test("no phone numbers are stored or listed", async () => {
  const h = await createDb();
  const cols = await h.rows(
    "select column_name from information_schema.columns where table_schema='public' and table_name='profiles'",
  );
  assert.ok(!cols.some((c) => c.column_name === "phone"));
  const out = await h.rows(
    "select pg_get_function_result('public.list_device_members(text)'::regprocedure) r",
  );
  assert.doesNotMatch(out[0].r, /phone/);
});
