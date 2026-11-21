// Migration 10: the sign-in screens learn what kind of account an email has.
import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { createDb, U1, U2, U3 } from "./harness.mjs";

let h;
const status = async (email) => (await h.one("select public.account_status($1) r", [email])).r;

beforeAll(async () => {
  h = await createDb();
  await h.users([
    [U1, "pass@x.io", "With password"],
    [U2, "link@x.io", null],
    [U3, "google@x.io", "Google"],
  ]);
  await h.db.query(
    "update auth.users set encrypted_password = 'hash', raw_app_meta_data = '{\"providers\":[\"email\"]}' where id = $1",
    [U1],
  );
  await h.db.query("update auth.users set email_confirmed_at = null where id = $1", [U2]);
  await h.db.query(
    'update auth.users set raw_app_meta_data = \'{"providers":["google"]}\' where id = $1',
    [U3],
  );
  await h.as("anon");
});

test("an unknown email has no account", async () => {
  assert.deepEqual(await status("nobody@x.io"), { status: "none" });
  assert.deepEqual(await status(null), { status: "none" });
});

test("a confirmed account with a password, case and spaces ignored", async () => {
  assert.deepEqual(await status("  PASS@x.io "), {
    status: "ready",
    password: true,
    google: false,
  });
});

test("an account made by an invitation link has no password and waits for confirmation", async () => {
  assert.deepEqual(await status("link@x.io"), {
    status: "unconfirmed",
    password: false,
    google: false,
  });
});

test("a Google account is reported as such", async () => {
  assert.deepEqual(await status("google@x.io"), { status: "ready", password: false, google: true });
});

test("the newest release is offered", async () => {
  await h.as(null);
  const r = await h.one("select latest_app_version v from public.app_config");
  assert.equal(r.v, "2.15.0");
});
