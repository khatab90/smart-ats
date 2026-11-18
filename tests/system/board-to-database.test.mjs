// End-to-end: the reference board (emulator logic) talks to the real
// database functions on PGlite. Covers the whole loop the app relies on:
// telemetry → status, events → notifications, app command → board → ack,
// settings change → board applies → app sees it confirmed.
import assert from "node:assert/strict";
import { beforeAll, describe, test } from "vitest";
import { EmulatedBoard } from "../../tools/device-emulator/board.mjs";
import { createDb, U1 } from "../db/harness.mjs";

let h;
let dev;
let board;
const clock = { t: Date.now(), now() { return this.t; } };

function pgliteTransport() {
  const call = async (sql, params) => {
    await h.as("anon");
    return (await h.one(sql, params)).r;
  };
  return {
    ingest: (p) => call("select public.device_ingest($1, $2, $3::jsonb) r", [dev.device_id, dev.token, JSON.stringify(p)]),
    getSettings: () => call("select public.device_get_settings($1, $2) r", [dev.device_id, dev.token]),
    ack: (id, status, result) =>
      call("select public.device_ack_command($1, $2, $3, $4, $5::jsonb) r", [
        dev.device_id,
        dev.token,
        id,
        status,
        result === null || result === undefined ? null : JSON.stringify(result),
      ]),
  };
}

/** Advances virtual time: control every 100 ms, report every 2 s. */
async function run(ms) {
  for (let i = 0; i < ms / 100; i++) {
    clock.t += 100;
    board.control(clock.t);
    if (i % 20 === 19) await board.report(clock.t);
  }
}

beforeAll(async () => {
  h = await createDb();
  await h.users([[U1, "owner@x.io", "Owner"]]);
  dev = await h.board("ATS-SYS001", U1, "owner@x.io");
  // The owner completes the device settings (nominal values) from the app.
  await h.as(U1, "owner@x.io");
  await h.db.exec(
    "update public.device_settings set nominal_voltage = 230, nominal_frequency = 50, return_delay_s = 30, priority = array['grid','solar','generator']",
  );
  board = new EmulatedBoard({ transport: pgliteTransport(), clock, timeScale: 1 });
  board.world.genFailStart = true; // keep the generator out of the way
});

describe("board ↔ database", () => {
  test("first contact: status online, settings fetched and confirmed", async () => {
    await board.report(clock.t); // learns settings_version
    await run(2_000);
    await h.as(U1, "owner@x.io");
    const st = await h.one("select online, mode, system_state, active_source, config_version, boot_id from public.device_status");
    const cfg = await h.one("select version from public.device_settings");
    assert.equal(st.online, true);
    assert.equal(st.active_source, "grid");
    assert.equal(st.system_state, "normal");
    assert.equal(st.config_version, cfg.version, "app shows settings as applied");
    assert.equal(st.boot_id, board.bootId);
  });

  test("grid outage → transfer to solar, notifications for outage and transfer", async () => {
    await run(32_000); // solar qualifies (return delay 30 s)
    board.world.grid = "off";
    await run(4_000);
    await h.as(U1, "owner@x.io");
    const st = await h.one("select active_source, system_state from public.device_status");
    assert.deepEqual(st, { active_source: "solar", system_state: "normal" });
    const types = (await h.rows("select type from public.notifications order by id")).map((r) => r.type);
    assert.ok(types.includes("source_outage"));
    assert.ok(types.includes("transfer"));
    const n = await h.one("select params from public.notifications where type='transfer'");
    assert.equal(n.params.from, "grid");
    assert.equal(n.params.to, "solar");
  });

  test("app command → board executes → ack completed and audited", async () => {
    await h.as(U1, "owner@x.io");
    const id = "cccccccc-0000-0000-0000-000000000001";
    await h.one("select (public.send_command($1, 'ATS-SYS001', 'reset_runtime', '{\"sources\":[\"solar\"]}')).id", [id]);
    await run(4_000); // delivered on one report, its event sent on the next
    await h.as(U1, "owner@x.io");
    const c = await h.one("select status, result from public.device_commands where id = $1", [id]);
    assert.equal(c.status, "completed");
    assert.deepEqual(c.result, { sources: ["solar"] });
    assert.equal((await h.rows("select id from public.events where type='runtime_reset'")).length, 1);
    assert.equal((await h.rows("select id from public.events where type='command_result'")).length, 1);
  });

  test("a board reboot keeps events (new boot_id) and the watchdog sees it come back", async () => {
    board.reboot();
    await run(2_000);
    await h.as(U1, "owner@x.io");
    const restarts = await h.rows("select boot_id from public.events where type='controller_restarted' order by id");
    assert.equal(restarts.length, 2);
    assert.notEqual(restarts[0].boot_id, restarts[1].boot_id);
  });
});
