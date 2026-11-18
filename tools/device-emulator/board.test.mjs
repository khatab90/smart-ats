// EmulatedBoard behaviour with a virtual clock and a fake transport.
// Each test reproduces an ATS finding from the audit report.
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EmulatedBoard } from "./board.mjs";

const SETTINGS = {
  version: 2,
  priority: ["grid", "generator", "solar"],
  nominal_voltage: 230,
  nominal_frequency: 50,
  uv_trip_pct: 17,
  uv_recover_pct: 13,
  uv_delay_ms: 2000,
  ov_trip_pct: 10,
  ov_recover_pct: 8,
  ov_delay_ms: 500,
  uf_trip_pct: 4,
  of_trip_pct: 4,
  f_recover_pct: 2,
  f_delay_ms: 1000,
  return_delay_s: 120,
  min_dwell_s: 60,
  rate_limit_count: 3,
  rate_limit_window_min: 10,
  neutral_delay_ms: 1000,
  transfer_timeout_ms: 2000,
  gen_crank_attempts: 3,
  gen_warmup_s: 30,
  gen_cooldown_s: 180,
};

function setup({ settings = {}, world = {} } = {}) {
  const clock = {
    t: 1_000_000,
    now() {
      return this.t;
    },
  };
  const sent = [];
  const acks = [];
  const pending = [];
  const transport = {
    async ingest(p) {
      sent.push(p);
      return {
        ok: true,
        server_time: new Date(clock.t).toISOString(),
        clock_invalid: false,
        settings_version: 2,
        commands: pending.splice(0),
      };
    },
    async getSettings() {
      return { ...SETTINGS, ...settings };
    },
    async ack(id, status, result) {
      acks.push({ id, status, result });
    },
  };
  const board = new EmulatedBoard({ transport, clock });
  Object.assign(board.world, world);
  board.settings = { ...SETTINGS, ...settings };
  board.configVersion = 2;
  const events = () => sent.flatMap((p) => p.events).map((e) => e.type);
  const allEvents = () => [...sent.flatMap((p) => p.events), ...board.buffer];
  /** Advances virtual time, running the 100 ms control loop. */
  const run = (ms) => {
    for (let i = 0; i < ms / 100; i++) {
      clock.t += 100;
      board.control(clock.t);
    }
  };
  // Let the non-active sources qualify (return delay) before the scenario.
  run(125_000);
  return { clock, board, sent, acks, pending, events, allEvents, run };
}

describe("ATS-1: protection keeps working while the generator starts", () => {
  test("an overvoltage on the active source opens it at once, before the generator is ready", () => {
    const s = setup({ world: { solar: "off" } });
    assert.equal(s.board.active, "grid");
    s.board.world.grid = "high"; // 262 V
    s.run(700); // ov_delay is 500 ms
    assert.equal(s.board.contactors.grid.cmd, false, "grid must be disconnected immediately");
    assert.equal(s.board.active, null);
    assert.equal(s.board.state, "transferring");
    assert.equal(s.board.transfer.to, "generator");
    assert.equal(s.board.transfer.phase, "prepare");
    // crank 3 s + warm-up 30 s + neutral 1 s
    s.run(40_000);
    assert.equal(s.board.active, "generator");
    assert.equal(s.board.state, "normal");
    const done = s.allEvents().find((e) => e.type === "transfer_completed");
    assert.equal(done.to, "generator");
    assert.equal(done.data.reason, "overvoltage");
  });

  test("if the active source fails during a planned generator start, it is opened without waiting", () => {
    const s = setup({ world: { solar: "off" } });
    // The user puts the generator first: Smart mode starts it while the grid
    // still feeds the load.
    s.board.settings = { ...s.board.settings, priority: ["generator", "grid", "solar"] };
    s.run(1_000);
    assert.equal(s.board.transfer?.phase, "prepare");
    assert.equal(s.board.active, "grid");
    assert.equal(s.board.state, "normal");
    s.board.world.grid = "off";
    s.run(200);
    assert.equal(s.board.contactors.grid.cmd, false);
    assert.equal(s.board.active, null);
  });
});

describe("ATS-3: a contactor that does not close is detected", () => {
  test("transfer fails with close_failed, the source is benched and the next one is used", () => {
    const s = setup({
      settings: { priority: ["grid", "solar", "generator"] },
      world: { stuckOpen: new Set(["solar"]) },
    });
    s.board.world.grid = "off";
    s.run(1_500 + 2_000 + 200); // neutral + feedback timeout
    const failed = s.allEvents().find((e) => e.type === "transfer_failed");
    assert.equal(failed?.data.reason, "close_failed");
    assert.equal(failed.to, "solar");
    assert.equal(s.board.contactors.solar.cmd, false);
    s.run(40_000);
    assert.equal(s.board.active, "generator");
  });
});

describe("ATS-5: interlock lockout is latched and cleared on site", () => {
  test("a welded contact locks the system; clearLockout recovers", () => {
    const s = setup({ settings: { priority: ["grid", "solar", "generator"] } });
    s.board.world.interlockWelded = true;
    s.board.world.grid = "off";
    s.run(300);
    assert.equal(s.board.state, "lockout");
    assert.ok(s.allEvents().some((e) => e.type === "interlock_fault"));
    s.run(10_000);
    assert.equal(s.board.state, "lockout", "stays latched");
    assert.equal(s.board.clearLockout(), true);
    assert.ok(s.allEvents().some((e) => e.type === "lockout_cleared"));
    s.run(2_000);
    assert.equal(s.board.active, "solar");
    assert.equal(s.board.state, "normal");
  });
});

describe("ATS-6: transfer_lockout is reported once per episode", () => {
  test("rate limiting does not emit an event on every control step", () => {
    const s = setup({
      settings: {
        priority: ["grid", "solar", "generator"],
        rate_limit_count: 2,
        min_dwell_s: 0,
        return_delay_s: 30,
      },
      world: { genFailStart: true },
    });
    // Flap the grid so Smart mode keeps returning to it.
    for (let i = 0; i < 4; i++) {
      s.board.world.grid = "off";
      s.run(3_000);
      s.board.world.grid = "on";
      s.run(35_000);
    }
    s.run(20_000);
    const n = s.allEvents().filter((e) => e.type === "transfer_lockout").length;
    assert.equal(n, 1);
  });
});

describe("Commands", () => {
  test("a re-delivered command is acknowledged again but executed once (DB-6)", async () => {
    const s = setup();
    const cmd = { id: "c-1", type: "reset_runtime", payload: { sources: ["grid"] } };
    s.pending.push(cmd);
    await s.board.report(s.clock.t);
    s.pending.push(cmd);
    await s.board.report(s.clock.t);
    await s.board.report(s.clock.t);
    assert.equal(s.allEvents().filter((e) => e.type === "runtime_reset").length, 1);
    assert.deepEqual(
      s.acks.filter((a) => a.id === "c-1").map((a) => a.status),
      ["accepted", "completed", "completed"],
    );
  });

  test("reset_generator clears a failed-to-start lock (ATS-2)", async () => {
    const s = setup({
      settings: { priority: ["grid", "generator", "solar"] },
      world: { solar: "off", genFailStart: true },
    });
    s.board.world.grid = "off";
    s.run(20_000);
    assert.equal(s.board.gen.locked, true);
    assert.ok(
      s
        .allEvents()
        .some((e) => e.type === "transfer_failed" && e.data.reason === "failed_to_start"),
    );
    assert.ok(s.allEvents().some((e) => e.type === "no_source_started"));
    s.board.world.genFailStart = false;
    s.pending.push({ id: "c-2", type: "reset_generator", payload: {} });
    await s.board.report(s.clock.t);
    assert.equal(s.board.gen.locked, false);
    s.run(40_000);
    assert.equal(s.board.active, "generator");
    assert.ok(s.allEvents().some((e) => e.type === "no_source_ended"));
  });

  test("manual transfer acks accepted → executing → completed", async () => {
    const s = setup({ settings: { priority: ["grid", "solar", "generator"] } });
    s.pending.push({ id: "m-1", type: "set_mode", payload: { mode: "manual" } });
    s.pending.push({ id: "m-2", type: "set_source", payload: { source: "solar" } });
    await s.board.report(s.clock.t);
    s.run(2_000);
    assert.equal(s.board.active, "solar");
    assert.deepEqual(
      s.acks.filter((a) => a.id === "m-2").map((a) => a.status),
      ["accepted", "executing", "completed"],
    );
  });
});

describe("DB-2 / DB-3 on the board side", () => {
  test("a reboot starts a new boot_id and restarts sequence numbers", async () => {
    const s = setup();
    await s.board.report(s.clock.t);
    const first = s.sent.at(-1);
    s.board.reboot();
    await s.board.report(s.clock.t);
    const second = s.sent.at(-1);
    assert.notEqual(first.boot_id, second.boot_id);
    assert.equal(second.seq, 1);
    assert.equal(second.events[0].seq, 1);
  });

  test("the board adopts server_time when told its clock is invalid", async () => {
    const s = setup();
    s.board.world.clockSkewMs = -s.clock.t; // 1970
    s.board.transport.ingest = async (p) => {
      s.sent.push(p);
      return {
        ok: true,
        server_time: new Date(s.clock.t).toISOString(),
        clock_invalid: true,
        commands: [],
      };
    };
    await s.board.report(s.clock.t);
    assert.ok(Date.parse(s.sent.at(-1).ts) < 1e9);
    await s.board.report(s.clock.t);
    assert.ok(Math.abs(Date.parse(s.sent.at(-1).ts) - s.clock.t) < 1000);
  });
});

describe("Accounting", () => {
  test("runtime only counts while the source actually feeds the load", () => {
    const s = setup({ settings: { priority: ["grid", "solar", "generator"] } });
    const before = s.board.nvs.runtime.grid.s;
    s.run(10_000);
    assert.ok(Math.abs(s.board.nvs.runtime.grid.s - before - 10) < 0.5);
    s.board.world.grid = "off";
    s.board.world.solar = "off";
    s.board.world.genFailStart = true;
    s.run(30_000);
    const frozen = { ...s.board.nvs.runtime };
    s.run(10_000);
    assert.deepEqual(
      Object.fromEntries(Object.entries(s.board.nvs.runtime).map(([k, v]) => [k, Math.round(v.s)])),
      Object.fromEntries(Object.entries(frozen).map(([k, v]) => [k, Math.round(v.s)])),
    );
  });
});
