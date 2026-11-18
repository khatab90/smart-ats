// Full migration chain on PGlite (PostgreSQL in WASM) with minimal Supabase
// stubs: RLS, device ingestion, notifications, commands, settings,
// invitations and roles. Behaviour added by later migrations has its own
// files next to this one.
import assert from "node:assert/strict";
import { test } from "vitest";
import { createDb, iso, migrationFiles, U1, U2, U3 } from "./harness.mjs";

let h;
let device;
const as = (...a) => h.as(...a);
const one = (...a) => h.one(...a);
const rows = (...a) => h.rows(...a);
const rejects = (...a) => h.rejects(...a);
const ingest = (payload) =>
  one("select public.device_ingest($1, $2, $3::jsonb) as r", [
    device.device_id,
    device.token,
    JSON.stringify(payload),
  ]);

test("migration chain applies; the latest migration can be re-run", async () => {
  h = await createDb();
  // Migrations run once, in order. The newest file must also survive a
  // second run (someone pasting it twice in the SQL editor).
  await h.db.exec(migrationFiles().at(-1).sql);
  const t = await rows("select tablename from pg_tables where schemaname='public' order by 1");
  assert.ok(t.length >= 13);
  const noRls = await rows(
    "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
  );
  assert.deepEqual(noRls, []);
});

test("factory registration and claim with PIN", async () => {
  await as(null);
  await h.db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1,'owner@x.io','{\"full_name\":\"Owner\"}'),($2,'other@x.io','{}'),($3,'invitee@x.io','{}')",
    [U1, U2, U3],
  );
  assert.equal((await one("select count(*)::int c from public.profiles")).c, 3);
  device = (await one("select public.register_device('ATS-T00001', 'production', '12345678') as d"))
    .d;
  assert.equal(device.pin, "12345678");
  assert.equal(device.token.length, 64);

  await as("anon");
  await rejects("select public.register_device('ATS-X', 'production')", [], /permission denied/);

  await as(U1, "owner@x.io");
  const bad = (
    await one("select public.claim_device('ATS-T00001','00000000','production','Home') r")
  ).r;
  assert.deepEqual(bad, { ok: false, error: "INVALID_PIN" });
  await rejects(
    "select public.claim_device('ATS-T00001','12345678','test','Home')",
    [],
    /ENVIRONMENT_MISMATCH/,
  );
  const ok = (
    await one(
      "select public.claim_device('ats-t00001','12345678','production','Home','',  'Asia/Riyadh') r",
    )
  ).r;
  assert.equal(ok.ok, true);
  await rejects(
    "select public.claim_device('ATS-T00001','12345678','production','Home')",
    [],
    /ALREADY_YOURS/,
  );
  await as(U2, "other@x.io");
  await rejects(
    "select public.claim_device('ATS-T00001','12345678','production','Mine')",
    [],
    /CLAIMED_BY_OTHER/,
  );
});

test("RLS isolates devices, secrets and history", async () => {
  await as(U2, "other@x.io");
  assert.equal((await rows("select * from public.devices")).length, 0);
  assert.equal((await rows("select * from public.device_status")).length, 0);
  await rejects("select * from public.device_secrets", [], /permission denied/);
  await as("anon");
  await rejects("select * from public.devices", [], /permission denied/);
  await rejects("select * from public.telemetry", [], /permission denied/);
  await as(U1, "owner@x.io");
  const d = await one("select id, name, location, owner_id from public.devices");
  assert.equal(d.name, "Home");
  assert.equal(d.location, null);
  assert.equal((await one("select timezone from public.device_settings")).timezone, "Asia/Riyadh");
  await rejects("update public.devices set owner_id = $1", [U2], /permission denied/);
});

test("device ingestion: auth, status, telemetry, energy, events", async () => {
  await as("anon");
  await rejects(
    "select public.device_ingest('ATS-T00001','wrong','{\"v\":1}'::jsonb)",
    [],
    /DEVICE_AUTH_FAILED/,
  );
  const t0 = Date.now() - 60_000;
  const base = {
    v: 1,
    interval_ms: 2000,
    mode: "smart",
    state: "normal",
    active: "grid",
    active_since: iso(t0 - 3600_000),
    sources: {
      grid: { v: 229.4, f: 60.01, available: true, qualified: true },
      solar: { v: null, f: null, available: false, reason: "no_voltage" },
      generator: { v: 0, f: 0, available: false, reason: "no_voltage" },
    },
    load: { v: 229.4, a: 9.8, w: 2210, f: 60.01 },
    contactors: {
      grid: { cmd: true, fb: true },
      solar: { cmd: false, fb: false },
      generator: { cmd: false, fb: false },
    },
    config_version: 1,
    energy_wh: { grid: 1000, solar: 0, generator: 0 },
    runtime: { grid: { s: 3600, since: iso(t0 - 86400_000) } },
  };
  let r = (await ingest({ ...base, seq: 1, ts: iso(t0) })).r;
  assert.equal(r.ok, true);
  assert.equal(r.settings_version, 2); // claim stored the owner's timezone
  r = (
    await ingest({
      ...base,
      seq: 2,
      ts: iso(t0 + 2000),
      energy_wh: { grid: 1350, solar: 0, generator: 0 },
      events: [
        {
          seq: 10,
          ts: iso(t0 + 1000),
          type: "electrical_fault",
          severity: "warning",
          source: "grid",
          data: { kind: "undervoltage", value: "182 V" },
        },
      ],
    })
  ).r;
  // replay of the same buffered event must not duplicate
  await ingest({
    ...base,
    seq: 3,
    ts: iso(t0 + 4000),
    energy_wh: { grid: 1350, solar: 0, generator: 0 },
    events: [
      {
        seq: 10,
        ts: iso(t0 + 1000),
        type: "electrical_fault",
        severity: "warning",
        source: "grid",
        data: { kind: "undervoltage", value: "182 V" },
      },
    ],
  });
  // An unknown event type is skipped; the rest of the message is still stored.
  r = (
    await ingest({
      ...base,
      seq: 4,
      ts: iso(t0 + 6000),
      energy_wh: { grid: 1350, solar: 0, generator: 0 },
      events: [{ seq: 99, type: "hack" }],
    })
  ).r;
  assert.equal(r.ok, true);
  assert.equal(r.skipped_events, 1);

  await as(U1, "owner@x.io");
  const st = await one(
    "select online, active_source, mode, (load->>'w')::int w from public.device_status",
  );
  assert.deepEqual(st, { online: true, active_source: "grid", mode: "smart", w: 2210 });
  assert.equal((await one("select count(*)::int c from public.telemetry")).c, 4);
  assert.equal(
    (await one("select sum(wh)::int s from public.energy_hourly where source='grid'")).s,
    350,
  );
  assert.equal(
    (await one("select count(*)::int c from public.events where type='electrical_fault'")).c,
    1,
  );
  const n = await rows("select type, critical, body from public.notifications");
  assert.equal(n.length, 1);
  assert.equal(n[0].type, "electrical_fault");
  assert.match(n[0].body, /انخفاض الجهد في الشبكة الوطنية: 182 V/);
});

test("notifications: preferences and dedupe respected", async () => {
  await as(U1, "owner@x.io");
  await h.db.query(
    "insert into public.notification_preferences (user_id, transfer) values ($1, false)",
    [U1],
  );
  await as("anon");
  const t = Date.now();
  await ingest({
    v: 1,
    seq: 4,
    ts: iso(t),
    mode: "smart",
    state: "normal",
    active: "solar",
    events: [
      {
        seq: 11,
        ts: iso(t - 3000),
        type: "source_lost",
        severity: "critical",
        source: "grid",
        data: { was_active: true, reason: "undervoltage" },
      },
      {
        seq: 12,
        ts: iso(t - 1000),
        type: "transfer_completed",
        from: "grid",
        to: "solar",
        data: { detect_ms: 2000, dead_ms: 1000 },
      },
      {
        seq: 13,
        ts: iso(t - 500),
        type: "source_lost",
        severity: "critical",
        source: "grid",
        data: { was_active: true },
      },
    ],
  });
  await as(U1, "owner@x.io");
  const types = (await rows("select type from public.notifications order by id")).map(
    (x) => x.type,
  );
  assert.deepEqual(types, ["electrical_fault", "source_outage"]); // transfer muted, outage deduped
  await rejects("update public.notifications set title = 'x'", [], /permission denied/);
  await h.db.exec("update public.notifications set read_at = now()");
  assert.equal(
    (await one("select count(*)::int c from public.notifications where read_at is null")).c,
    0,
  );
});

test("heartbeat watchdog marks offline and notifies", async () => {
  await as(null);
  await h.db.exec("update public.device_status set last_seen_at = now() - interval '45 seconds'");
  assert.equal((await one("select public.check_device_heartbeats() c")).c, 1);
  await as(U1, "owner@x.io");
  assert.equal((await one("select online from public.device_status")).online, false);
  assert.equal(
    (await one("select count(*)::int c from public.notifications where type='connection_lost'")).c,
    1,
  );
  await rejects(
    "select public.send_command(gen_random_uuid(), 'ATS-T00001', 'set_mode', '{\"mode\":\"manual\"}')",
    [],
    /DEVICE_OFFLINE/,
  );
  await as("anon");
  await ingest({
    v: 1,
    seq: 5,
    ts: iso(Date.now()),
    mode: "smart",
    state: "normal",
    active: "solar",
  });
  await as(U1, "owner@x.io");
  assert.equal((await one("select online from public.device_status")).online, true);
  assert.equal(
    (await one("select count(*)::int c from public.events where type='connection_restored'")).c,
    1,
  );
});

test("command lifecycle with idempotency and device ack", async () => {
  await as(U1, "owner@x.io");
  const id = "aaaaaaaa-0000-0000-0000-000000000001";
  await rejects(
    "select public.send_command($1, 'ATS-T00001', 'set_mode', '{\"mode\":\"auto\"}')",
    [id],
    /INVALID_PAYLOAD/,
  );
  const c1 = await one(
    "select (public.send_command($1, 'ATS-T00001', 'set_mode', '{\"mode\":\"manual\"}')).*",
    [id],
  );
  const c2 = await one(
    "select (public.send_command($1, 'ATS-T00001', 'set_mode', '{\"mode\":\"manual\"}')).*",
    [id],
  );
  assert.equal(c1.status, "pending");
  assert.equal(c2.created_at.getTime(), c1.created_at.getTime());
  await as("anon");
  const r = (
    await ingest({
      v: 1,
      seq: 6,
      ts: iso(Date.now()),
      mode: "smart",
      state: "normal",
      active: "solar",
    })
  ).r;
  assert.equal(r.commands.length, 1);
  assert.equal(r.commands[0].id, id);
  await one("select public.device_ack_command($1,$2,$3,'accepted')", [
    device.device_id,
    device.token,
    id,
  ]);
  await one("select public.device_ack_command($1,$2,$3,'completed','{\"mode\":\"manual\"}')", [
    device.device_id,
    device.token,
    id,
  ]);
  const dup = (
    await one("select public.device_ack_command($1,$2,$3,'completed') r", [
      device.device_id,
      device.token,
      id,
    ])
  ).r;
  assert.equal(dup.duplicate, true);
  await as(U1, "owner@x.io");
  assert.equal(
    (await one("select status from public.device_commands where id=$1", [id])).status,
    "completed",
  );
  const audit = await one("select actor_id from public.events where type='command_result'");
  assert.equal(audit.actor_id, U1);
});

test("settings: admin update bumps version and is audited; invalid values rejected", async () => {
  await as(U1, "owner@x.io");
  await h.db.exec(
    "update public.device_settings set nominal_voltage = 230, nominal_frequency = 60, priority = array['solar','grid','generator']",
  );
  const s = await one("select version, updated_by from public.device_settings");
  assert.equal(s.version, 3);
  assert.equal(s.updated_by, U1);
  await rejects("update public.device_settings set nominal_frequency = 55", [], /check constraint/);
  await rejects(
    "update public.device_settings set priority = array['grid','grid','solar']",
    [],
    /check constraint/,
  );
  await rejects("update public.device_settings set neutral_delay_ms = 100", [], /check constraint/);
  await rejects("update public.device_settings set version = 99", [], /permission denied/);
  const ev = await one(
    "select data from public.events where type='settings_changed' and (data->>'version')::int = 3",
  );
  assert.deepEqual(Object.keys(ev.data.changed).sort(), [
    "nominal_frequency",
    "nominal_voltage",
    "priority",
  ]);
  await as("anon");
  const ds = (
    await one("select public.device_get_settings($1,$2) s", [device.device_id, device.token])
  ).s;
  assert.equal(ds.version, 3);
  assert.deepEqual(ds.priority, ["solar", "grid", "generator"]);
});

let token;
test("invitations: one-time, email-bound, expiring, revocable", async () => {
  await as(U1, "owner@x.io");
  const inv = (
    await one("select public.create_invitation('ATS-T00001', 'Invitee@X.io', 'viewer') r")
  ).r;
  token = inv.token;
  await rejects("select token_hash from public.invitations", [], /permission denied/);
  assert.equal((await rows("select email, role from public.invitations"))[0].email, "invitee@x.io");

  await as(U2, "other@x.io");
  const info = (await one("select public.get_invitation($1) r", [token])).r;
  assert.equal(info.status, "pending");
  assert.equal(info.email_matches, false);
  await rejects("select public.accept_invitation($1)", [token], /INVITATION_EMAIL_MISMATCH/);
  await rejects(
    "select public.create_invitation('ATS-T00001', 'z@x.io', 'admin')",
    [],
    /NOT_ADMIN/,
  );

  await as(U3, "invitee@x.io");
  const acc = (await one("select public.accept_invitation($1) r", [token])).r;
  assert.equal(acc.role, "viewer");
  await rejects("select public.accept_invitation($1)", [token], /INVITATION_CLOSED/);
  assert.equal((await rows("select * from public.devices")).length, 1);
  // viewers can read but not control or configure
  await rejects(
    "select public.send_command(gen_random_uuid(), 'ATS-T00001', 'set_mode', '{\"mode\":\"smart\"}')",
    [],
    /NOT_ADMIN/,
  );
  await h.db.exec("update public.device_settings set return_delay_s = 300");
  await as(U1, "owner@x.io");
  assert.equal(
    (await one("select return_delay_s from public.device_settings")).return_delay_s,
    120,
  );
  // Profiles are private; co-members are listed through a checked function.
  assert.deepEqual(
    (await rows("select email from public.profiles")).map((x) => x.email),
    ["owner@x.io"],
  );
  const members = (
    await rows("select email from public.list_device_members('ATS-T00001') order by email")
  ).map((x) => x.email);
  assert.deepEqual(members, ["invitee@x.io", "owner@x.io"]);

  const inv2 = (await one("select public.create_invitation('ATS-T00001', 'late@x.io', 'admin') r"))
    .r;
  await as(null);
  await h.db.query(
    "update public.invitations set expires_at = now() - interval '1 minute' where id = $1",
    [inv2.id],
  );
  await h.db.query(
    "insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444','late@x.io')",
  );
  await as("44444444-4444-4444-4444-444444444444", "late@x.io");
  await rejects("select public.accept_invitation($1)", [inv2.token], /INVITATION_EXPIRED/);
  await as(U1, "owner@x.io");
  const re = (await one("select public.resend_invitation($1) r", [inv2.id])).r;
  await h.db.query("select public.revoke_invitation($1)", [inv2.id]);
  await as("44444444-4444-4444-4444-444444444444", "late@x.io");
  await rejects("select public.accept_invitation($1)", [re.token], /INVITATION_CLOSED/);
});

test("roles, ownership transfer and release", async () => {
  await as(U1, "owner@x.io");
  await rejects(
    "select public.set_member_role('ATS-T00001', $1, 'viewer')",
    [U1],
    /CANNOT_CHANGE_OWNER/,
  );
  await rejects("select public.transfer_ownership('ATS-T00001', $1)", [U3], /TARGET_NOT_ADMIN/);
  await h.db.query("select public.set_member_role('ATS-T00001', $1, 'admin')", [U3]);
  await h.db.query("select public.transfer_ownership('ATS-T00001', $1)", [U3]);
  await rejects("select public.release_device('ATS-T00001')", [], /NOT_OWNER/);
  await as(U3, "invitee@x.io");
  await rejects("select public.remove_member('ATS-T00001', $1)", [U3], /CANNOT_REMOVE_OWNER/);
  await h.db.query("select public.remove_member('ATS-T00001', $1)", [U1]);
  await h.db.query("select public.release_device('ATS-T00001')");
  assert.equal((await rows("select * from public.devices")).length, 0);
  await as(null);
  const left = await one(
    "select (select count(*) from public.events)::int e, (select count(*) from public.telemetry)::int t, (select owner_id from public.devices) o, (select active_source from public.device_status) a, (select runtime from public.device_status) rt",
  );
  assert.deepEqual(left, { e: 0, t: 0, o: null, a: null, rt: null });
});
