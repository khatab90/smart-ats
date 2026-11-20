// Migration 7: the server tells apps which versions it supports.
import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { createDb, U1 } from "./harness.mjs";

let h;
beforeAll(async () => {
  h = await createDb();
  await h.users([[U1, "owner@x.io", "Khatab"]]);
});

test("anyone, signed in or not, can read the supported versions", async () => {
  for (const who of [["anon"], [U1, "owner@x.io"]]) {
    await h.as(...who);
    const r = (await h.one("select public.app_requirements() r")).r;
    assert.match(r.min_version, /^\d+\.\d+\.\d+$/);
    assert.match(r.latest_version, /^\d+\.\d+\.\d+$/);
    assert.match(r.download_url, /^https:\/\//);
  }
});

test("only the server can change them", async () => {
  await h.as(U1, "owner@x.io");
  await h.rejects(
    "update public.app_config set min_app_version = '9.9.9'",
    [],
    /permission denied/,
  );
  await h.as("anon");
  await h.rejects("select * from public.app_config", [], /permission denied/);
});
