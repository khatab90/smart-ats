// EmulatedBoard behaviour with a virtual clock and a fake transport.
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EmulatedBoard } from "./board.mjs";

const SETTINGS = {
  version: 2,
  priority: ["grid", "solar", "generator"],
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
  timezone: "UTC",
  utc_offset_min: 0,
  solar_schedule: { enabled: false, periods: [] },
};

// Wednesday 2026-11-18 10:00 UTC.
const T0 = Date.parse("2026-11-18T10:00:00Z");

function setup({ settings = {}, world = {}, at = T0 } = {}) {
  const clock = {
    t: at - 125_000,
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
  Object.assign(board.world, { generator: "on" }, world);
  board.settings = { ...SETTINGS, ...settings };
  board.configVersion = 2;
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
  return { clock, board, sent, acks, pending, allEvents, run };
}

const DAY = { days: [0, 1, 2, 3, 4, 5, 6] };

describe("passive sources", () => {
  test("the generator is used only when it delivers power; the board never starts it", () => {
    const s = setup({
      settings: { priority: ["grid", "generator", "solar"] },
      world: { generator: "off", solar: "off" },
    });
    s.board.world.grid = "off";
    s.run(3_000);
    assert.equal(s.board.active, null);
    assert.equal(s.board.state, "no_source");
    assert.equal(s.board.contactors.generator.cmd, false);
    s.board.world.generator = "on"; // someone starts it by hand
    s.run(125_000); // must be stable for the return delay first
    assert.equal(s.board.active, "generator");
    assert.ok(s.allEvents().some((e) => e.type === "no_source_ended"));
  });
});

describe("protection", () => {
  test("an overvoltage on the active source opens it at once (ATS-1)", () => {
    const s = setup();
    s.board.world.grid = "high"; // 262 V
    s.run(700); // ov_delay is 500 ms
    assert.equal(s.board.contactors.grid.cmd, false, "grid must be disconnected immediately");
    s.run(1_500);
    assert.equal(s.board.active, "solar");
    const done = s.allEvents().find((e) => e.type === "transfer_completed");
    assert.equal(done.from, "grid");
    assert.equal(done.data.reason, "overvoltage");
  });

  test("a contactor that does not close fails the transfer and the next source is used (ATS-3)", () => {
    const s = setup({ world: { stuckOpen: new Set(["solar"]) } });
    s.board.world.grid = "off";
    s.run(1_500 + 2_000 + 200); // neutral + feedback timeout
    const failed = s.allEvents().find((e) => e.type === "transfer_failed");
    assert.equal(failed?.data.reason, "close_failed");
    assert.equal(failed.to, "solar");
    assert.equal(s.board.contactors.solar.cmd, false);
    s.run(2_000);
    assert.equal(s.board.active, "generator");
  });

  test("a welded contact latches a lockout; clearLockout recovers (ATS-5)", () => {
    const s = setup();
    s.board.world.interlockWelded = true;
    s.board.world.grid = "off";
    s.run(300);
    assert.equal(s.board.state, "lockout");
    s.run(10_000);
    assert.equal(s.board.state, "lockout", "stays latched");
    assert.equal(s.board.clearLockout(), true);
    s.run(2_000);
    assert.equal(s.board.active, "solar");
    assert.ok(s.allEvents().some((e) => e.type === "lockout_cleared"));
  });

  test("transfer_lockout is reported once per rate-limit episode (ATS-6)", () => {
    const s = setup({
      settings: { rate_limit_count: 2, min_dwell_s: 0, return_delay_s: 30 },
      world: { generator: "off" },
    });
    for (let i = 0; i < 4; i++) {
      s.board.world.grid = "off";
      s.run(3_000);
      s.board.world.grid = "on";
      s.run(35_000);
    }
    s.run(20_000);
    assert.equal(s.allEvents().filter((e) => e.type === "transfer_lockout").length, 1);
  });
});

describe("solar schedule (Smart mode)", () => {
  const outside = { enabled: true, periods: [{ ...DAY, start: "12:00", end: "14:00" }] }; // now is 10:00
  const inside = { enabled: true, periods: [{ ...DAY, start: "08:00", end: "17:00" }] };

  test("outside its hours solar is never used, even with nothing else available", () => {
    const s = setup({ settings: { solar_schedule: outside }, world: { generator: "off" } });
    s.board.world.grid = "off";
    s.run(3_000);
    assert.equal(s.board.active, null);
    assert.equal(s.board.state, "no_source");
    const ns = s.allEvents().find((e) => e.type === "no_source_started");
    assert.equal(ns.data.solar, "outside_schedule");
  });

  test("manual mode ignores the schedule", async () => {
    const s = setup({ settings: { solar_schedule: outside }, world: { generator: "off" } });
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

  test("when the period ends Smart mode moves to the next available source", () => {
    const s = setup({
      settings: {
        priority: ["solar", "grid", "generator"],
        solar_schedule: { enabled: true, periods: [{ ...DAY, start: "08:00", end: "10:05" }] },
      },
    });
    assert.equal(s.board.active, "solar", "solar first and inside its hours");
    s.run(6 * 60_000); // period ends at 10:05
    assert.equal(s.board.active, "grid");
    const t = s.allEvents().find((e) => e.type === "transfer_completed" && e.to === "grid");
    assert.equal(t.data.reason, "schedule");
  });

  test("when the period ends with nothing else, solar is disconnected", () => {
    const s = setup({
      settings: {
        priority: ["solar", "grid", "generator"],
        solar_schedule: { enabled: true, periods: [{ ...DAY, start: "08:00", end: "10:05" }] },
      },
      world: { generator: "off" },
    });
    s.board.world.grid = "off";
    s.run(5 * 60_000);
    assert.equal(s.board.contactors.solar.cmd, false);
    assert.equal(s.board.state, "no_source");
  });

  test("when the period starts Smart mode returns to solar if it is first", () => {
    const s = setup({
      settings: {
        priority: ["solar", "grid", "generator"],
        solar_schedule: { enabled: true, periods: [{ ...DAY, start: "10:05", end: "17:00" }] },
      },
    });
    assert.equal(s.board.active, "grid");
    s.run(6 * 60_000);
    assert.equal(s.board.active, "solar");
  });

  test("the board reports whether solar is allowed and uses the device offset", async () => {
    const s = setup({ settings: { solar_schedule: inside, utc_offset_min: 180 } }); // 13:00 local
    await s.board.report(s.clock.t);
    assert.equal(s.sent.at(-1).sources.solar.allowed, true);
    s.board.settings = { ...s.board.settings, utc_offset_min: 480 }; // 18:00 local
    await s.board.report(s.clock.t);
    assert.equal(s.sent.at(-1).sources.solar.allowed, false);
    assert.equal(s.sent.at(-1).sources.grid.allowed, true);
  });
});

describe("commands", () => {
  test("a re-delivered command is acknowledged again but executed once (DB-6)", async () => {
    const s = setup();
    const cmd = { id: "c-1", type: "reset_runtime", payload: { sources: ["grid"] } };
    s.pending.push(cmd);
    await s.board.report(s.clock.t);
    s.pending.push(cmd);
    await s.board.report(s.clock.t);
    assert.equal(s.allEvents().filter((e) => e.type === "runtime_reset").length, 1);
    assert.deepEqual(
      s.acks.filter((a) => a.id === "c-1").map((a) => a.status),
      ["accepted", "completed", "completed"],
    );
  });

  test("unknown commands (e.g. the old reset_generator) are rejected", async () => {
    const s = setup();
    s.pending.push({ id: "c-9", type: "reset_generator", payload: {} });
    await s.board.report(s.clock.t);
    assert.equal(s.acks.find((a) => a.id === "c-9").status, "rejected");
  });
});

describe("board side of DB-2 / DB-3", () => {
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

describe("accounting", () => {
  test("runtime only counts while the source actually feeds the load", () => {
    const s = setup({ world: { generator: "off" } });
    const before = s.board.nvs.runtime.grid.s;
    s.run(10_000);
    assert.ok(Math.abs(s.board.nvs.runtime.grid.s - before - 10) < 0.5);
    s.board.world.grid = "off";
    s.board.world.solar = "off";
    s.run(3_000);
    const frozen = Object.values(s.board.nvs.runtime).map((v) => Math.round(v.s));
    s.run(10_000);
    assert.deepEqual(
      Object.values(s.board.nvs.runtime).map((v) => Math.round(v.s)),
      frozen,
    );
  });
});
