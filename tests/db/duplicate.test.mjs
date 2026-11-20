// Two boards reporting with the same device ID (migration 4): detected from
// boot_id "returns", resolved in favour of the board that started first,
// and never confused with a reboot, a boot loop or one delayed message.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "vitest";
import { createDb, U1 } from "./harness.mjs";

let h;
let dev;
let seq = 0;

beforeEach(async () => {
  h = await createDb();
  await h.users([[U1, "owner@x.io", "Owner"]]);
  dev = await h.board("ATS-DUP001", U1, "owner@x.io");
  seq = 0;
});

/** One message from the board with this boot_id (as anon, like a real board). */
async function send(boot, extra = {}) {
  await h.as("anon");
  return h.ingest(dev, {
    v: 1,
    boot_id: boot,
    seq: ++seq,
    ts: new Date().toISOString(),
    interval_ms: 2000,
    mode: "smart",
    state: "normal",
    active: boot === "A" ? "grid" : "solar",
    ...extra,
  });
}

async function status() {
  await h.as(null);
  return h.one(
    "select boot_id, active_source, duplicate_since, duplicate_hits, duplicate_boot_id from public.device_status",
  );
}

async function events(type) {
  await h.as(null);
  return h.rows("select data from public.events where type = $1", [type]);
}

describe("no false alarms", () => {
  test("a normal reboot (A A A B B B)", async () => {
    for (const b of ["A", "A", "A", "B", "B", "B"]) assert.equal((await send(b)).ok, true);
    const st = await status();
    assert.equal(st.duplicate_since, null);
    assert.equal(st.boot_id, "B");
  });

  test("a boot loop: every start is a new boot_id", async () => {
    for (const b of ["A", "B", "C", "D", "E", "F"]) assert.equal((await send(b)).ok, true);
    assert.equal((await status()).duplicate_since, null);
  });

  test("one delayed message from before a reboot", async () => {
    for (const b of ["A", "A", "B", "A", "B", "B", "B"]) assert.equal((await send(b)).ok, true);
    assert.equal((await status()).duplicate_since, null);
    assert.equal((await events("duplicate_board")).length, 0);
  });
});

describe("two boards alternating", () => {
  test("flagged after three returns; the board that started first is the one accepted", async () => {
    await send("A");
    await send("A");
    const replies = [];
    for (const b of ["B", "A", "B", "A", "B", "A", "B"]) replies.push([b, await send(b)]);
    const st = await status();
    assert.ok(st.duplicate_since, "conflict recorded");
    assert.equal(st.duplicate_boot_id, "B");
    assert.equal(st.boot_id, "A", "status stays on the first board");
    assert.equal(st.active_source, "grid");
    // Once flagged, B is refused and A accepted.
    const last = replies.slice(-2);
    assert.deepEqual(
      last.map(([b, r]) => [b, r.ok]),
      [
        ["A", true],
        ["B", false],
      ],
    );
    assert.equal(last[1][1].reason, "duplicate_board");
    assert.equal((await events("duplicate_board")).length, 1, "one event per conflict");
  });

  test("the owner gets one critical notification", async () => {
    for (const b of ["A", "A", "B", "A", "B", "A", "B", "A"]) await send(b);
    await h.as(U1, "owner@x.io");
    const n = await h.rows(
      "select type, critical, params from public.notifications where params->>'event' = 'duplicate_board'",
    );
    assert.equal(n.length, 1);
    assert.equal(n[0].type, "connection_lost");
    assert.equal(n[0].critical, true);
  });

  test("commands reach only the accepted board; the refused one keeps its events", async () => {
    for (const b of ["A", "A", "B", "A", "B", "A", "B"]) await send(b);
    await h.as(U1, "owner@x.io");
    await h.one(
      "select (public.send_command(gen_random_uuid(), 'ATS-DUP001', 'set_mode', '{\"mode\":\"manual\"}')).id",
    );
    const refused = await send("B", {
      events: [
        {
          seq: 1,
          ts: new Date().toISOString(),
          type: "mode_changed",
          severity: "info",
          data: { mode: "smart" },
        },
      ],
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.commands, undefined);
    assert.equal((await events("mode_changed")).length, 0, "nothing stored from the refused board");
    const accepted = await send("A");
    assert.equal(accepted.commands.length, 1);
    assert.equal(accepted.commands[0].type, "set_mode");
  });

  test("when the first board stops, the other one takes over", async () => {
    for (const b of ["A", "A", "B", "A", "B", "A", "B"]) await send(b);
    await h.as(null);
    await h.db.exec(
      "update public.device_boots set last_seen_at = now() - interval '3 minutes' where boot_id = 'A'",
    );
    assert.equal((await send("B")).ok, true);
    assert.equal((await status()).boot_id, "B");
  });

  test("the warning clears two minutes after the second board went quiet", async () => {
    for (const b of ["A", "A", "B", "A", "B", "A", "B"]) await send(b);
    await h.as(null);
    await h.db.exec(`
      update public.device_status set duplicate_seen_at = now() - interval '3 minutes';
      update public.device_boots set last_seen_at = now() - interval '3 minutes' where boot_id = 'B';`);
    assert.equal((await send("A")).ok, true);
    const st = await status();
    assert.equal(st.duplicate_since, null);
    assert.equal(st.duplicate_boot_id, null);
    assert.equal((await events("duplicate_board_cleared")).length, 1);
  });
});

test("boot bookkeeping is not readable by app users", async () => {
  await send("A");
  await h.as(U1, "owner@x.io");
  await h.rejects("select * from public.device_boots", [], /permission denied/);
});
