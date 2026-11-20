// Migration 2 (reliability, security, retention). Each test reproduces a
// finding from the audit report and proves the fix.
import assert from "node:assert/strict";
import { beforeAll, describe, test } from "vitest";
import { createDb, iso, U1, U2, U3 } from "./harness.mjs";

let h;
let dev;
const ok = (extra = {}) => ({
  v: 1,
  ts: iso(Date.now()),
  mode: "smart",
  state: "normal",
  active: "grid",
  load: { v: 230, a: 5, w: 1150, f: 50 },
  ...extra,
});

beforeAll(async () => {
  h = await createDb();
  await h.users([
    [U1, "owner@x.io", "Owner"],
    [U2, "viewer@x.io", "Viewer"],
    [U3, "stranger@x.io", "Stranger"],
  ]);
  dev = await h.board("ATS-R00001", U1, "owner@x.io");
  // U2 joins as a viewer through an invitation.
  await h.as(U1, "owner@x.io");
  const inv = (
    await h.one("select public.create_invitation('ATS-R00001','viewer@x.io','viewer') r")
  ).r;
  await h.as(U2, "viewer@x.io");
  await h.one("select public.accept_invitation($1) r", [inv.token]);
  await h.as("anon");
});

describe("DB-1: one bad field never rejects the whole message", () => {
  test("invalid events are skipped and counted; valid events, status and telemetry are stored", async () => {
    await h.as("anon");
    const r = await h.ingest(
      dev,
      ok({
        seq: 1,
        boot_id: "boot-a",
        events: [
          {
            seq: 1,
            type: "source_lost",
            severity: "error",
            source: "grid",
            data: { was_active: true },
          },
          { seq: 2, type: "transfer_completed", from: "grid", to: "solar" },
          { seq: 3, type: "electrical_fault", source: "moon", data: "not-an-object" },
          { seq: "x", type: "unknown_type" },
          "not an object",
          { seq: 4, type: "source_lost", data: { was_active: "maybe" } },
        ],
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.skipped_events, 2); // unknown type + non-object
    await h.as(null);
    const ev = await h.rows(
      "select seq, type, severity, source, data from public.events where origin='device' order by seq",
    );
    assert.deepEqual(
      ev.map((e) => [e.seq === null ? null : Number(e.seq), e.type, e.severity, e.source]),
      [
        [1, "source_lost", "info", "grid"], // bad severity → info
        [2, "transfer_completed", "info", null],
        [3, "electrical_fault", "info", null], // bad source → null, bad data → {}
        [4, "source_lost", "info", null],
      ],
    );
    assert.deepEqual(ev[2].data, {});
    const st = await h.one("select skipped_events, mode, active_source from public.device_status");
    assert.equal(Number(st.skipped_events), 2);
    assert.equal(st.mode, "smart");
    assert.equal(st.active_source, "grid");
    assert.equal((await h.one("select count(*)::int c from public.telemetry")).c, 1);
  });

  test("out-of-range status fields become null instead of failing", async () => {
    await h.as("anon");
    const r = await h.ingest(
      dev,
      ok({
        seq: 2,
        boot_id: "boot-a",
        mode: "auto",
        state: "fault",
        active: "battery",
        interval_ms: 5,
        rssi: 20,
        config_version: "abc",
        sources: [1, 2],
        alarms: "x",
        load: { v: "NaN", a: "lots", w: 1e12, f: 50 },
      }),
    );
    assert.equal(r.ok, true);
    await h.as(null);
    const st = await h.one(
      "select mode, system_state, active_source, interval_ms, rssi, config_version, sources, alarms from public.device_status",
    );
    assert.deepEqual(st, {
      mode: null,
      system_state: null,
      active_source: null,
      interval_ms: null,
      rssi: null,
      config_version: null,
      sources: null,
      alarms: [],
    });
    const t = await h.one(
      "select load_voltage, load_current, load_power_w, load_frequency from public.telemetry order by id desc limit 1",
    );
    assert.deepEqual(t, {
      load_voltage: null,
      load_current: null,
      load_power_w: null,
      load_frequency: 50,
    });
  });

  test("an unsupported protocol version is still rejected", async () => {
    await h.as("anon");
    await h.rejects(
      "select public.device_ingest($1, $2, '{\"v\":2}'::jsonb)",
      [dev.device_id, dev.token],
      /UNSUPPORTED_PROTOCOL/,
    );
  });
});

describe("DB-2: events are de-duplicated per boot", () => {
  test("a replay within the same boot is ignored, a reused seq after reboot is kept", async () => {
    await h.as("anon");
    const ev = { seq: 50, type: "controller_restarted", data: { reason: "power_on" } };
    await h.ingest(dev, ok({ seq: 3, boot_id: "boot-a", events: [ev] }));
    await h.ingest(dev, ok({ seq: 4, boot_id: "boot-a", events: [ev] })); // replay
    await h.ingest(dev, ok({ seq: 1, boot_id: "boot-b", events: [ev] })); // reboot, NVS wiped
    await h.as(null);
    const n = await h.rows(
      "select boot_id from public.events where seq = 50 and type='controller_restarted' order by id",
    );
    assert.deepEqual(
      n.map((x) => x.boot_id),
      ["boot-a", "boot-b"],
    );
    assert.equal((await h.one("select boot_id from public.device_status")).boot_id, "boot-b");
  });
});

describe("DB-3: a wrong board clock never freezes the status", () => {
  test("server time is used, the board is told, buffered event spacing is kept", async () => {
    await h.as("anon");
    const before = Date.now();
    const r = await h.ingest(dev, {
      v: 1,
      seq: 2,
      boot_id: "boot-c",
      ts: "1970-01-01T00:10:00Z",
      mode: "manual",
      state: "normal",
      active: "solar",
      events: [
        { seq: 1, ts: "1970-01-01T00:09:00Z", type: "mode_changed", data: { mode: "manual" } },
        {
          seq: 2,
          ts: "1970-01-01T00:09:30Z",
          type: "transfer_completed",
          from: "grid",
          to: "solar",
        },
      ],
    });
    assert.equal(r.clock_invalid, true);
    assert.ok(Date.parse(r.server_time) >= before - 1000);
    await h.as(null);
    const st = await h.one(
      "select mode, active_source, clock_invalid, device_ts from public.device_status",
    );
    assert.equal(st.mode, "manual"); // status updated despite the 1970 clock
    assert.equal(st.active_source, "solar");
    assert.equal(st.clock_invalid, true);
    assert.ok(Math.abs(st.device_ts.getTime() - Date.now()) < 60_000);
    const ev = await h.rows(
      "select occurred_at from public.events where boot_id='boot-c' order by seq",
    );
    const gap = ev[1].occurred_at.getTime() - ev[0].occurred_at.getTime();
    assert.equal(gap, 30_000);
    assert.ok(Math.abs(ev[1].occurred_at.getTime() - (Date.now() - 30_000)) < 60_000);
    const t = await h.one("select device_ts from public.telemetry order by id desc limit 1");
    assert.ok(Math.abs(t.device_ts.getTime() - Date.now()) < 60_000);

    await h.as("anon");
    await h.ingest(dev, ok({ seq: 3, boot_id: "boot-c" }));
    await h.as(null);
    assert.equal(
      (await h.one("select clock_invalid from public.device_status")).clock_invalid,
      false,
    );
  });
});

describe("DB-6: delivered commands are not re-sent on every message", () => {
  test("re-delivery waits 3 s without an ack", async () => {
    await h.as(U1, "owner@x.io");
    const id = "bbbbbbbb-0000-0000-0000-000000000001";
    await h.one(
      "select (public.send_command($1, 'ATS-R00001', 'reset_runtime', '{\"sources\":[\"grid\"]}')).id",
      [id],
    );
    await h.as("anon");
    assert.equal((await h.ingest(dev, ok({ seq: 4, boot_id: "boot-c" }))).commands.length, 1);
    assert.equal((await h.ingest(dev, ok({ seq: 5, boot_id: "boot-c" }))).commands.length, 0);
    await h.as(null);
    await h.db.query(
      "update public.device_commands set updated_at = now() - interval '4 seconds' where id = $1",
      [id],
    );
    await h.as("anon");
    const again = await h.ingest(dev, ok({ seq: 6, boot_id: "boot-c" }));
    assert.deepEqual(
      again.commands.map((c) => c.id),
      [id],
    );
  });
});

describe("Passive generator and solar schedule", () => {
  test("generator start commands and settings no longer exist", async () => {
    await h.as(U1, "owner@x.io");
    await h.rejects(
      "select public.send_command(gen_random_uuid(), 'ATS-R00001', 'reset_generator', '{}')",
      [],
      /INVALID_COMMAND/,
    );
    await h.as(null);
    const cols = (
      await h.rows(
        "select column_name from information_schema.columns where table_name='device_settings' and column_name like 'gen\\_%'",
      )
    ).map((c) => c.column_name);
    assert.deepEqual(cols, []);
  });

  test("the board can report lockout_cleared; generator_reset is no longer a valid event", async () => {
    await h.as("anon");
    const r = await h.ingest(
      dev,
      ok({
        seq: 7,
        boot_id: "boot-c",
        events: [
          { seq: 10, type: "generator_reset" },
          { seq: 11, type: "lockout_cleared", data: { by: "site_button" } },
        ],
      }),
    );
    assert.equal(r.skipped_events, 1);
  });

  test("an admin can set a valid solar schedule; the board receives it with the UTC offset", async () => {
    await h.as(U1, "owner@x.io");
    const sched = {
      enabled: true,
      periods: [
        { days: [0, 1, 2, 3, 4, 5, 6], start: "08:00", end: "17:00" },
        { days: [5], start: "20:00", end: "02:00" },
      ],
    };
    await h.db.query(
      "update public.device_settings set solar_schedule = $1, timezone = 'Asia/Baghdad'",
      [JSON.stringify(sched)],
    );
    await h.as("anon");
    const s = (
      await h.one("select public.device_get_settings($1, $2) s", [dev.device_id, dev.token])
    ).s;
    assert.deepEqual(s.solar_schedule, sched);
    assert.equal(s.utc_offset_min, 180);
    assert.equal("gen_warmup_s" in s, false);
  });

  test("invalid schedules are rejected by the database", async () => {
    await h.as(U1, "owner@x.io");
    const bad = [
      { enabled: true, periods: [] }, // enabled without any period
      { enabled: true, periods: [{ days: [7], start: "08:00", end: "17:00" }] },
      { enabled: true, periods: [{ days: [1], start: "8:00", end: "17:00" }] },
      { enabled: true, periods: [{ days: [1], start: "24:00", end: "17:00" }] },
      { enabled: true, periods: [{ days: [1], start: "08:00", end: "08:00" }] },
      { enabled: true, periods: [{ days: [], start: "08:00", end: "17:00" }] },
      { enabled: "yes", periods: [] },
      { enabled: false },
    ];
    for (const b of bad) {
      await h.rejects(
        "update public.device_settings set solar_schedule = $1",
        [JSON.stringify(b)],
        /check constraint/,
      );
    }
    await h.as(U2, "viewer@x.io");
    await h.db.query(
      'update public.device_settings set solar_schedule = \'{"enabled": false, "periods": []}\'',
    );
    await h.as(U1, "owner@x.io");
    assert.equal(
      (
        await h.one(
          "select solar_schedule->>'enabled' e from public.device_settings where device_id='ATS-R00001'",
        )
      ).e,
      "true",
      "a viewer cannot change it",
    );
  });
});

describe("SEC-4: profiles are private; members see each other's names and emails", () => {
  test("a member sees the members list, a stranger does not", async () => {
    await h.as(U2, "viewer@x.io");
    assert.equal((await h.rows("select id from public.profiles")).length, 1);
    const m = await h.rows(
      "select email, is_owner from public.list_device_members('ATS-R00001') order by email",
    );
    assert.deepEqual(m, [
      { email: "owner@x.io", is_owner: true },
      { email: "viewer@x.io", is_owner: false },
    ]);
    await h.as(U3, "stranger@x.io");
    await h.rejects("select * from public.list_device_members('ATS-R00001')", [], /NOT_MEMBER/);
  });
});

describe("SEC-5: claiming checks the PIN before revealing ownership", () => {
  test("a wrong PIN on a claimed board says INVALID_PIN, not CLAIMED_BY_OTHER", async () => {
    await h.as(U3, "stranger@x.io");
    const bad = (
      await h.one("select public.claim_device('ATS-R00001','00000000','production','Mine') r")
    ).r;
    assert.deepEqual(bad, { ok: false, error: "INVALID_PIN" });
    await h.rejects(
      "select public.claim_device('ATS-R00001','12345678','production','Mine')",
      [],
      /CLAIMED_BY_OTHER/,
    );
  });

  test("an invalid time zone falls back to UTC instead of failing the claim", async () => {
    await h.as(null);
    const d = (await h.one("select public.register_device('ATS-R00002','production','22222222') d"))
      .d;
    await h.as(U3, "stranger@x.io");
    const r = (
      await h.one(
        "select public.claim_device($1,'22222222','production','Shop','', 'Mars/Base') r",
        [d.device_id],
      )
    ).r;
    assert.equal(r.ok, true);
    assert.equal(
      (await h.one("select timezone from public.device_settings where device_id='ATS-R00002'"))
        .timezone,
      "UTC",
    );
  });
});

describe("Notifications: every type can be muted, params carry the facts", () => {
  test("muting source_outage is respected; params describe the event", async () => {
    await h.as(U2, "viewer@x.io");
    await h.db.query(
      "insert into public.notification_preferences (user_id, source_outage) values ($1, false)",
      [U2],
    );
    await h.as("anon");
    await h.ingest(
      dev,
      ok({
        seq: 8,
        boot_id: "boot-c",
        events: [
          {
            seq: 20,
            type: "source_lost",
            source: "solar",
            severity: "critical",
            data: { was_active: true },
          },
        ],
      }),
    );
    await h.as(U2, "viewer@x.io");
    assert.equal(
      (
        await h.rows(
          "select id from public.notifications where type='source_outage' and params->>'source'='solar'",
        )
      ).length,
      0,
    );
    await h.as(U1, "owner@x.io");
    const n = await h.one(
      "select params, critical from public.notifications where type='source_outage' order by id desc limit 1",
    );
    assert.equal(n.critical, true);
    assert.deepEqual(n.params, { event: "source_lost", source: "solar", device: "Home" });
  });
});

describe("ATS-4: capacity and max-current settings are gone", () => {
  test("columns no longer exist", async () => {
    await h.as(null);
    const cols = (
      await h.rows(
        "select column_name from information_schema.columns where table_name='device_settings' and (column_name like '%capacity%' or column_name = 'max_current_a')",
      )
    ).map((c) => c.column_name);
    assert.deepEqual(cols, []);
  });
});

describe("DB-4: retention", () => {
  test("prune_history keeps recent rows and removes expired ones", async () => {
    await h.as(null);
    await h.db.exec(`
      insert into public.telemetry (device_id, device_ts) values ('ATS-R00001', now() - interval '4 days');
      insert into public.events (device_id, occurred_at, origin, type) values ('ATS-R00001', now() - interval '400 days', 'server', 'connection_lost');
      insert into public.notifications (user_id, device_id, type, title, body, created_at)
        values ('${U1}', 'ATS-R00001', 'transfer', 't', 'b', now() - interval '100 days');
      insert into public.device_commands (id, device_id, type, status, created_at, expires_at)
        values (gen_random_uuid(), 'ATS-R00001', 'set_mode', 'completed', now() - interval '40 days', now());
    `);
    const count = () =>
      h.one(`select
        (select count(*) from public.telemetry where device_ts < now() - interval '3 days')::int t,
        (select count(*) from public.events where occurred_at < now() - interval '365 days')::int e,
        (select count(*) from public.notifications where created_at < now() - interval '90 days')::int n,
        (select count(*) from public.device_commands where created_at < now() - interval '30 days')::int c,
        (select count(*) from public.events)::int all_events`);
    const b = await count();
    assert.deepEqual([b.t, b.e, b.n, b.c], [1, 1, 1, 1]);
    await h.db.exec("select public.prune_history()");
    const a = await count();
    assert.deepEqual([a.t, a.e, a.n, a.c], [0, 0, 0, 0]);
    assert.equal(a.all_events, b.all_events - 1);
  });
});

describe("Privileges", () => {
  test("internal helpers and maintenance jobs are not callable by clients", async () => {
    for (const role of ["anon", U1]) {
      await h.as(role, "owner@x.io");
      for (const fn of [
        "select public.prune_history()",
        "select public.check_device_heartbeats()",
        "select public._insert_device_event('ATS-R00001','', '{}'::jsonb, now(), interval '0')",
        "select public._safe_int('1')",
        "select public.register_device('ATS-HACK1')",
      ]) {
        await h.rejects(fn, [], /permission denied/);
      }
    }
    await h.as("anon");
    await h.rejects(
      "select * from public.list_device_members('ATS-R00001')",
      [],
      /permission denied/,
    );
  });
});

describe("SEC-8: release wipes the previous owner's last status", () => {
  test("device_status is empty after release", async () => {
    await h.as(U1, "owner@x.io");
    await h.db.query("select public.release_device('ATS-R00001')");
    await h.as(null);
    const st = await h.one(
      "select online, active_source, runtime, energy_wh, boot_id, skipped_events from public.device_status where device_id='ATS-R00001'",
    );
    assert.deepEqual(
      { ...st, skipped_events: Number(st.skipped_events) },
      {
        online: false,
        active_source: null,
        runtime: null,
        energy_wh: null,
        boot_id: null,
        skipped_events: 0,
      },
    );
  });
});
