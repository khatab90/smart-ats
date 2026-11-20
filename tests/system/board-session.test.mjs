// End-to-end without a simulator: replays the messages a real board session
// sent (tests/system/board-session.json, recorded from the reference board
// in smart-ats-simulator) into the real database functions on PGlite.
// Covers the loop the app relies on: telemetry → status, events →
// notifications, app command → board → ack, reboot → new boot_id.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeAll, describe, test } from "vitest";
import { createDb, U1 } from "../db/harness.mjs";

const SESSION = JSON.parse(readFileSync(new URL("./board-session.json", import.meta.url), "utf8"));
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

/** Moves every recorded timestamp to the present, so the server accepts the board clock. */
function shift(value, ms) {
  if (typeof value === "string" && ISO.test(value))
    return new Date(Date.parse(value) + ms).toISOString();
  if (Array.isArray(value)) return value.map((v) => shift(v, ms));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, ms)]));
  return value;
}

let h;
let dev;
let next = 0;
const offset = Date.now() - 60_000 - Date.parse(SESSION.recordedFrom);
const bootIds = new Set();

/** Replays recorded steps up to (and including) a checkpoint. */
async function replayTo(checkpoint) {
  for (; next < SESSION.steps.length; next++) {
    const s = SESSION.steps[next];
    if (s.checkpoint) {
      if (s.checkpoint === checkpoint) {
        next++;
        return;
      }
      continue;
    }
    if (s.app === "send_command") {
      await h.as(U1, "owner@x.io");
      await h.one("select (public.send_command($1, $2, $3, $4::jsonb)).id", [
        s.id,
        dev.device_id,
        s.type,
        JSON.stringify(s.payload),
      ]);
      continue;
    }
    await h.as("anon");
    if (s.call === "device_ingest") {
      const p = shift(s.args, offset);
      bootIds.add(p.boot_id);
      await h.one("select public.device_ingest($1, $2, $3::jsonb) r", [
        dev.device_id,
        dev.token,
        JSON.stringify(p),
      ]);
    } else if (s.call === "device_get_settings") {
      await h.one("select public.device_get_settings($1, $2) r", [dev.device_id, dev.token]);
    } else if (s.call === "device_ack_command") {
      const { id, status, result } = s.args;
      await h.one("select public.device_ack_command($1, $2, $3, $4, $5::jsonb) r", [
        dev.device_id,
        dev.token,
        id,
        status,
        result === null ? null : JSON.stringify(result),
      ]);
    }
  }
  throw new Error(`checkpoint ${checkpoint} not in the recording`);
}

beforeAll(async () => {
  h = await createDb();
  await h.users([[U1, "owner@x.io", "Owner"]]);
  dev = await h.board("ATS-SYS001", U1, "owner@x.io");
  // The owner completes the device settings from the app, as in the recording.
  await h.as(U1, "owner@x.io");
  await h.db.exec(
    "update public.device_settings set nominal_voltage = 230, nominal_frequency = 50, return_delay_s = 30, priority = array['grid','solar','generator']",
  );
});

describe("recorded board session ↔ database", () => {
  test("first contact: status online, settings fetched and confirmed", async () => {
    await replayTo("first_contact");
    await h.as(U1, "owner@x.io");
    const st = await h.one(
      "select online, system_state, active_source, config_version, boot_id from public.device_status",
    );
    const cfg = await h.one("select version from public.device_settings");
    assert.equal(st.online, true);
    assert.equal(st.active_source, "grid");
    assert.equal(st.system_state, "normal");
    assert.equal(st.config_version, cfg.version, "app shows settings as applied");
    assert.ok(bootIds.has(st.boot_id));
  });

  test("grid outage → transfer to solar, notifications for outage and transfer", async () => {
    await replayTo("grid_outage");
    await h.as(U1, "owner@x.io");
    const st = await h.one("select active_source, system_state from public.device_status");
    assert.deepEqual(st, { active_source: "solar", system_state: "normal" });
    const types = (await h.rows("select type from public.notifications order by id")).map(
      (r) => r.type,
    );
    assert.ok(types.includes("source_outage"));
    assert.ok(types.includes("transfer"));
    const n = await h.one("select params from public.notifications where type='transfer'");
    assert.equal(n.params.from, "grid");
    assert.equal(n.params.to, "solar");
  });

  test("app command → board executes → ack completed and audited", async () => {
    await replayTo("command_done");
    await h.as(U1, "owner@x.io");
    const c = await h.one("select status, result from public.device_commands where id = $1", [
      "cccccccc-0000-0000-0000-000000000001",
    ]);
    assert.equal(c.status, "completed");
    assert.deepEqual(c.result, { sources: ["solar"] });
    assert.equal(
      (await h.rows("select id from public.events where type='runtime_reset'")).length,
      1,
    );
    assert.equal(
      (await h.rows("select id from public.events where type='command_result'")).length,
      1,
    );
  });

  test("a board reboot keeps events (new boot_id)", async () => {
    await replayTo("rebooted");
    await h.as(U1, "owner@x.io");
    const restarts = await h.rows(
      "select boot_id from public.events where type='controller_restarted' order by id",
    );
    assert.equal(restarts.length, 2);
    assert.notEqual(restarts[0].boot_id, restarts[1].boot_id);
  });
});
