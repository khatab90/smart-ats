// Migration 3: invitations a signed-in user finds by their verified email
// (Google sign-in may never open the invitation email).
import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { createDb, U1, U2, U3 } from "./harness.mjs";

const U4 = "44444444-4444-4444-4444-444444444444";
let h;
let inviteId;

beforeAll(async () => {
  h = await createDb();
  await h.users([
    [U1, "owner@x.io", "Khatab"],
    [U2, "guest@x.io", "Guest"],
    [U3, "other@x.io", "Other"],
    [U4, "unverified@x.io", "Not yet"],
  ]);
  await h.as(null);
  await h.db.query("update auth.users set email_confirmed_at = null where id = $1", [U4]);
  await h.board("ATS-INV001", U1, "owner@x.io");
  await h.as(U1, "owner@x.io");
  inviteId = (
    await h.one("select public.create_invitation('ATS-INV001', 'Guest@X.io', 'viewer') r")
  ).r.id;
  await h.one("select public.create_invitation('ATS-INV001', 'unverified@x.io', 'viewer') r");
});

test("the invited user sees the invitation without the email link", async () => {
  await h.as(U2, "guest@x.io");
  const list = await h.rows("select * from public.my_invitations()");
  assert.equal(list.length, 1);
  assert.equal(list[0].device_name, "Home");
  assert.equal(list[0].role, "viewer");
  assert.equal(list[0].inviter_name, "Khatab");
});

test("nobody else sees it or can accept it", async () => {
  await h.as(U3, "other@x.io");
  assert.equal((await h.rows("select * from public.my_invitations()")).length, 0);
  await h.rejects("select public.accept_my_invitation($1)", [inviteId], /EMAIL_MISMATCH/);
});

test("an unverified email is never trusted, even if the JWT carries it", async () => {
  await h.as(U4, "unverified@x.io");
  assert.equal((await h.rows("select * from public.my_invitations()")).length, 0);
  // Members cannot read invitations; look the id up as the superuser.
  await h.as(null);
  const row = await h.one("select id from public.invitations where email = 'unverified@x.io'");
  await h.as(U4, "unverified@x.io");
  await h.rejects("select public.accept_my_invitation($1)", [row.id], /EMAIL_MISMATCH/);
});

test("accepting makes the user a member once; the list is then empty", async () => {
  await h.as(U2, "guest@x.io");
  const r = (await h.one("select public.accept_my_invitation($1) r", [inviteId])).r;
  assert.equal(r.ok, true);
  assert.equal(r.role, "viewer");
  assert.equal((await h.rows("select * from public.my_invitations()")).length, 0);
  await h.rejects("select public.accept_my_invitation($1)", [inviteId], /INVITATION_CLOSED/);
  const m = await h.rows("select role from public.device_members where user_id = $1", [U2]);
  assert.deepEqual(m, [{ role: "viewer" }]);
});

test("anonymous callers cannot use the functions", async () => {
  await h.as("anon");
  await h.rejects("select * from public.my_invitations()", [], /permission denied/);
  await h.rejects("select public._verified_email()", [], /permission denied/);
});
