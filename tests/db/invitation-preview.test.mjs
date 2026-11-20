// Migration 5: the sign-in screen previews an invitation from its link.
import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { createDb, U1, U2 } from "./harness.mjs";

let h;
let token;

beforeAll(async () => {
  h = await createDb();
  await h.users([
    [U1, "owner@x.io", "Khatab"],
    [U2, "guest@x.io", "Guest"],
  ]);
  await h.board("ATS-PRV001", U1, "owner@x.io");
  await h.as(U1, "owner@x.io");
  token = (await h.one("select public.create_invitation('ATS-PRV001', 'guest@x.io', 'admin') r")).r
    .token;
});

test("without a session, the link's token shows who is invited to what", async () => {
  await h.as("anon");
  const r = (await h.one("select public.invitation_preview($1) r", [token])).r;
  assert.equal(r.status, "pending");
  assert.equal(r.email, "guest@x.io");
  assert.equal(r.role, "admin");
  assert.equal(r.device_name, "Home");
  assert.equal(r.inviter_name, "Khatab");
});

test("a wrong token reveals nothing", async () => {
  await h.as("anon");
  const r = (await h.one("select public.invitation_preview('nope') r")).r;
  assert.deepEqual(r, { status: "invalid" });
});

test("an accepted invitation no longer shows its details", async () => {
  await h.as(U2, "guest@x.io");
  await h.one("select public.accept_invitation($1) r", [token]);
  await h.as("anon");
  const r = (await h.one("select public.invitation_preview($1) r", [token])).r;
  assert.deepEqual(r, { status: "accepted" });
});

test("anonymous users still cannot read or accept invitations directly", async () => {
  await h.as("anon");
  await h.rejects("select public.get_invitation($1)", [token], /permission denied/);
  await h.rejects("select public.accept_invitation($1)", [token], /permission denied/);
});
