// EmulatedBoard — the reference behaviour of the ESP32 controller.
//
// A non-blocking state machine driven by two calls:
//   control(now)  every ~100 ms: measurements, protection, decisions, transfer steps
//   report(now)   every interval_ms: one device_ingest round-trip
// Time and I/O are injected (`clock`, `transport`) so the same code runs in
// the CLI against Supabase and in tests against PGlite with a virtual clock.
import { SOURCES, mayTransfer, smartTarget, stepQualification } from "./logic.mjs";

const FALLBACK_NOMINAL = { v: 230, f: 50 }; // used until the user sets nominal values
const EVENT_BUFFER_MAX = 500;
const CRANK_MS = 3000;
const CRANK_REST_MS = 2000;
const CONTACTOR_MOVE_MS = 40;
const CLOSE_FAIL_COOLDOWN_MS = 60_000;

const randomId = () => Math.random().toString(16).slice(2, 10);

export class EmulatedBoard {
  /**
   * @param {object} o
   * @param {{ ingest(p): Promise<any>, getSettings(): Promise<any>, ack(id, status, result?): Promise<any> }} o.transport
   * @param {{ now(): number }} o.clock
   * @param {number} [o.intervalMs]
   * @param {number} [o.timeScale] divides human-scale timers (warm-up, return delay…) for demos
   * @param {(line: string) => void} [o.log]
   */
  constructor({
    transport,
    clock,
    intervalMs = 2000,
    timeScale = 1,
    bootSource = "grid",
    log = () => {},
  }) {
    this.transport = transport;
    this.clock = clock;
    this.intervalMs = intervalMs;
    this.scale = Math.max(1, timeScale);
    this.log = log;

    // Persistent (NVS) state survives reboot().
    this.nvs = {
      energyWh: { grid: 0, solar: 0, generator: 0 },
      runtime: Object.fromEntries(SOURCES.map((s) => [s, { s: 0, since: null }])),
    };
    // Physical world, driven by CLI / tests.
    this.world = {
      grid: "on",
      solar: "on",
      genFailStart: false,
      loadW: 2200,
      interlockWelded: false,
      stuckOpen: new Set(),
      offlineUntil: 0,
      clockSkewMs: 0,
    };
    this.bootSource = bootSource;
    this.boot();
  }

  // ------------------------------------------------------------ lifecycle
  boot() {
    const now = this.clock.now();
    this.bootAt = now;
    this.bootId = randomId();
    this.eventSeq = 0;
    this.telemetrySeq = 0;
    this.buffer = [];
    this.droppedEvents = 0;
    this.settings = null;
    this.configVersion = 0;
    this.clockOffsetMs = 0;
    this.mode = "smart";
    this.modeSince = now;
    this.manualChoice = null;
    this.override = null;
    this.state = "normal";
    this.lockout = null; // { reason }
    this.active = this.bootSource;
    this.activeSince = now;
    this.lastOpenAt = 0;
    this.transfer = null;
    this.transfers = [];
    this.rateLimited = false;
    this.noSourceReported = false;
    this.gen = { running: false, locked: false, warmUntil: 0, stopAt: 0 };
    this.closeFailedUntil = { grid: 0, solar: 0, generator: 0 };
    this.handled = new Map(); // command id → last ack, for de-duplication
    this.qual = Object.fromEntries(
      SOURCES.map((s) => [
        s,
        { qualified: s === this.active, badSince: null, goodSince: null, kind: null },
      ]),
    );
    this.contactors = Object.fromEntries(
      SOURCES.map((s) => [s, { cmd: s === this.active, fb: s === this.active }]),
    );
    for (const s of SOURCES) this.nvs.runtime[s].since ??= this.iso(now);
    this.lastTick = now;
    this.emit("controller_restarted", { data: { reason: "power_on" } });
  }

  reboot() {
    this.log("  ⟳ reboot (new boot_id, sequence numbers restart)");
    this.boot();
  }

  // ------------------------------------------------------------- helpers
  boardNow() {
    return this.clock.now() + this.world.clockSkewMs + this.clockOffsetMs;
  }
  iso(t = this.boardNow()) {
    return new Date(t).toISOString();
  }
  cfg() {
    const s = this.settings ?? {};
    return {
      ...s,
      nominal_voltage: s.nominal_voltage ?? FALLBACK_NOMINAL.v,
      nominal_frequency: s.nominal_frequency ?? FALLBACK_NOMINAL.f,
      uv_trip_pct: s.uv_trip_pct ?? 17,
      uv_recover_pct: s.uv_recover_pct ?? 13,
      uv_delay_ms: s.uv_delay_ms ?? 2000,
      ov_trip_pct: s.ov_trip_pct ?? 10,
      ov_recover_pct: s.ov_recover_pct ?? 8,
      ov_delay_ms: s.ov_delay_ms ?? 500,
      uf_trip_pct: s.uf_trip_pct ?? 4,
      of_trip_pct: s.of_trip_pct ?? 4,
      f_recover_pct: s.f_recover_pct ?? 2,
      f_delay_ms: s.f_delay_ms ?? 1000,
      return_delay_s: (s.return_delay_s ?? 120) / this.scale,
      min_dwell_s: (s.min_dwell_s ?? 60) / this.scale,
      rate_limit_count: s.rate_limit_count ?? 6,
      rate_limit_window_min: s.rate_limit_window_min ?? 10,
      neutral_delay_ms: s.neutral_delay_ms ?? 1000,
      transfer_timeout_ms: s.transfer_timeout_ms ?? 5000,
      gen_crank_attempts: s.gen_crank_attempts ?? 3,
      gen_warmup_s: (s.gen_warmup_s ?? 30) / this.scale,
      gen_cooldown_s: (s.gen_cooldown_s ?? 180) / this.scale,
      priority: s.priority ?? SOURCES,
    };
  }
  emit(type, extra = {}) {
    if (this.buffer.length >= EVENT_BUFFER_MAX) {
      this.buffer.shift();
      this.droppedEvents++;
    }
    this.buffer.push({ seq: ++this.eventSeq, ts: this.iso(), type, severity: "info", ...extra });
    this.log(
      `  ↳ event ${type} ${extra.source ?? extra.to ?? ""} ${extra.data?.reason ?? extra.data?.kind ?? ""}`.trimEnd(),
    );
  }

  /** Voltage and frequency each source presents right now. */
  reading(id) {
    const c = this.cfg();
    const noise = (a) => (Math.random() - 0.5) * a;
    if (id === "generator") {
      if (!this.gen.running) return { v: 0, f: 0 };
      return { v: c.nominal_voltage - 6 + noise(4), f: c.nominal_frequency + 0.2 + noise(0.2) };
    }
    const p = this.world[id];
    if (p === "off") return { v: 0, f: 0 };
    const k = p === "low" ? 0.78 : p === "high" ? 1.14 : 1;
    return { v: c.nominal_voltage * k + noise(3), f: c.nominal_frequency + noise(0.06) };
  }

  reasonFor(id) {
    if (id === "generator" && this.gen.locked) return "failed_to_start";
    if (id === "generator" && !this.gen.running) return "standby";
    const q = this.qual[id];
    return q.qualified ? null : (q.kind ?? "no_voltage");
  }

  /** Sources Smart mode may pick: qualified, or a healthy stopped generator. */
  candidates(now) {
    return Object.fromEntries(
      SOURCES.map((s) => {
        const blocked = this.closeFailedUntil[s] > now;
        const ok =
          this.qual[s].qualified || (s === "generator" && !this.gen.running && !this.gen.locked);
        return [s, { qualified: ok && !blocked }];
      }),
    );
  }

  setContactor(id, closed) {
    this.contactors[id].cmd = closed;
  }

  /** Auxiliary-contact feedback after the contactor had time to move. */
  feedbackSettled(id) {
    const c = this.contactors[id];
    if (c.cmd) c.fb = !this.world.stuckOpen.has(id);
    else c.fb = id === this.lastOpened && this.world.interlockWelded;
    return c.fb;
  }

  // ------------------------------------------------------------- control
  control(now = this.clock.now()) {
    this.accumulate(now);
    if (this.lockout) return; // latched: contactors stay as they are until cleared on site

    const c = this.cfg();
    for (const s of SOURCES) {
      const r = stepQualification(this.qual[s], this.reading(s), c, now, s === this.active);
      this.qual[s] = r.q;
      if (r.tripped) {
        const wasActive = s === this.active;
        this.emit("source_lost", {
          severity: wasActive ? "critical" : "warning",
          source: s,
          data: { was_active: wasActive, reason: r.kind },
        });
        if (r.kind && r.kind !== "no_voltage") {
          this.emit("electrical_fault", {
            severity: "warning",
            source: s,
            data: { kind: r.kind, value: `${this.reading(s).v.toFixed(0)} V` },
          });
        }
      }
    }

    // Generator cool-down after it stopped feeding the load.
    if (
      this.gen.running &&
      this.active !== "generator" &&
      this.gen.stopAt &&
      now > this.gen.stopAt
    ) {
      if (this.transfer?.to !== "generator") {
        this.gen.running = false;
        this.gen.stopAt = 0;
        this.qual.generator = { qualified: false, badSince: null, goodSince: null, kind: null };
      }
    }

    if (
      this.mode === "manual" &&
      this.settings?.manual_revert_min &&
      now - this.modeSince > this.settings.manual_revert_min * 60_000
    ) {
      this.mode = "smart";
      this.modeSince = now;
      this.override = null;
      this.emit("mode_changed", { data: { mode: "smart", reason: "manual_revert" } });
    }

    // PROTECTION FIRST: a source outside its limits is disconnected at once,
    // whatever else is going on (generator cranking / warming up included).
    if (
      this.active &&
      !this.qual[this.active].qualified &&
      (!this.transfer || this.transfer.phase === "prepare")
    ) {
      this.protectiveOpen(now);
      if (this.lockout) return;
    }

    if (this.transfer) this.stepTransfer(now);
    else this.decide(now);
    this.updateState();
  }

  protectiveOpen(now) {
    const from = this.active;
    this.log(`  ⚡ protection opens ${from} (${this.qual[from].kind})`);
    this.setContactor(from, false);
    this.lastOpened = from;
    if (this.feedbackSettled(from)) {
      this.enterLockout(from);
      return;
    }
    if (from === "generator") this.gen.stopAt = now + this.cfg().gen_cooldown_s * 1000;
    this.lastOpenAt = now;
    this.openedFor = { from, at: now, badSince: this.qual[from].badSince };
    this.active = null;
    if (this.transfer) this.transfer.from = from;
    if (this.mode === "manual") {
      this.override = {
        active: true,
        at: this.iso(),
        reason: this.qual[from].kind ?? "no_voltage",
        requested: this.manualChoice ?? from,
      };
      this.emit("protection_override", { severity: "warning", data: this.override });
    }
  }

  enterLockout(source) {
    this.lockout = { reason: "interlock_mismatch", source };
    this.state = "lockout";
    if (this.transfer?.cmdId)
      void this.ackCommand(this.transfer.cmdId, "failed", { reason: "عطل القفل المتبادل" });
    this.transfer = null;
    this.emit("interlock_fault", { severity: "critical", source, data: { contactor: source } });
  }

  decide(now) {
    const c = this.cfg();
    const activeOk = this.active ? this.qual[this.active].qualified : false;
    if (this.mode === "manual" && activeOk) return;

    const target = smartTarget(c.priority, this.candidates(now));
    if (!target) {
      if (!this.active) this.reportNoSource();
      return;
    }
    if (target === this.active) return;

    const windowMs = c.rate_limit_window_min * 60_000;
    this.transfers = this.transfers.filter((t) => now - t < windowMs);
    if (this.rateLimited && this.transfers.length < c.rate_limit_count) this.rateLimited = false;

    const check = mayTransfer({
      active: this.active,
      activeQualified: activeOk,
      target,
      activeSince: this.activeSince,
      now,
      settings: c,
      recentTransfers: this.transfers,
    });
    if (!check.ok) {
      if (check.reason === "rate_limit" && !this.rateLimited) {
        this.rateLimited = true; // reported once per episode
        this.emit("transfer_lockout", { severity: "warning", data: { kind: "unstable" } });
      }
      return;
    }
    this.rateLimited = false;
    const reason = !activeOk
      ? ((this.openedFor?.from ? this.qual[this.openedFor.from].kind : null) ?? "source_lost")
      : "priority_return";
    this.startTransfer(target, reason, now);
  }

  reportNoSource() {
    if (this.noSourceReported) return;
    this.noSourceReported = true;
    for (const s of SOURCES) this.setContactor(s, false);
    this.emit("no_source_started", {
      severity: "critical",
      data: Object.fromEntries(SOURCES.map((s) => [s, this.reasonFor(s) ?? "stopped"])),
    });
  }

  startTransfer(to, reason, now, cmdId = null) {
    const needsGen = to === "generator" && !this.gen.running;
    this.transfer = {
      to,
      reason,
      cmdId,
      // A source just disconnected by protection is still the one we leave.
      from: this.active ?? this.openedFor?.from ?? null,
      t0: now,
      detectMs: this.openedFor?.badSince ? now - this.openedFor.badSince : 0,
      phase: needsGen ? "prepare" : "open",
      until: now,
      attempt: 0,
      timings: {},
    };
    this.emit("transfer_started", {
      from: this.transfer.from,
      to,
      data: { reason, mode: this.mode },
    });
    if (needsGen) this.crank(now);
  }

  crank(now) {
    const t = this.transfer;
    t.attempt += 1;
    t.sub = "crank";
    t.until = now + CRANK_MS / this.scale;
    this.log(`  … cranking generator (${t.attempt}/${this.cfg().gen_crank_attempts})`);
  }

  failTransfer(reason, now) {
    const t = this.transfer;
    this.emit("transfer_failed", {
      severity: "critical",
      from: t.from,
      to: t.to,
      data: { reason, mode: this.mode },
    });
    if (t.cmdId) void this.ackCommand(t.cmdId, "failed", { reason: FAIL_TEXT[reason] ?? reason });
    this.transfer = null;
    if (!this.active) {
      this.noSourceReported = false;
      // Try the next candidate on the next control step; report no_source if none.
      const next = smartTarget(this.cfg().priority, this.candidates(now));
      if (!next) this.reportNoSource();
    }
  }

  stepTransfer(now) {
    const t = this.transfer;
    const c = this.cfg();
    if (now < t.until) return;

    if (t.phase === "prepare") {
      if (t.sub === "crank") {
        if (!this.world.genFailStart) {
          this.gen.running = true;
          this.gen.stopAt = 0;
          t.sub = "warmup";
          t.until = now + c.gen_warmup_s * 1000;
          this.log(`  … generator running, warming up ${c.gen_warmup_s.toFixed(1)} s`);
          return;
        }
        if (t.attempt < c.gen_crank_attempts) {
          t.sub = "rest";
          t.until = now + CRANK_REST_MS / this.scale;
          return;
        }
        this.gen.locked = true;
        this.failTransfer("failed_to_start", now);
        return;
      }
      if (t.sub === "rest") {
        this.crank(now);
        return;
      }
      // warm-up done
      this.qual.generator = { qualified: true, badSince: null, goodSince: now, kind: null };
      t.phase = "open";
    }

    if (t.phase === "open") {
      if (this.active) {
        t.from = this.active;
        this.setContactor(t.from, false);
        this.lastOpened = t.from;
        t.openedAt = now;
        t.phase = "open_verify";
        t.until = now + CONTACTOR_MOVE_MS;
        return;
      }
      t.phase = "neutral";
      t.until = Math.max(now, this.lastOpenAt + c.neutral_delay_ms);
      return;
    }

    if (t.phase === "open_verify") {
      if (this.feedbackSettled(t.from)) {
        this.enterLockout(t.from);
        return;
      }
      t.timings.open_ms = now - t.openedAt;
      if (t.from === "generator") this.gen.stopAt = now + c.gen_cooldown_s * 1000;
      this.lastOpenAt = now;
      this.active = null;
      t.phase = "neutral";
      t.until = now + c.neutral_delay_ms;
      return;
    }

    if (t.phase === "neutral") {
      if (
        !this.candidates(now)[t.to]?.qualified &&
        !(t.to === "generator" && this.gen.running && this.qual.generator.qualified)
      ) {
        this.failTransfer("target_lost", now);
        return;
      }
      this.setContactor(t.to, true);
      t.closeAt = now;
      t.phase = "close_verify";
      t.until = now + CONTACTOR_MOVE_MS;
      return;
    }

    if (t.phase === "close_verify") {
      if (!this.feedbackSettled(t.to)) {
        if (now - t.closeAt < c.transfer_timeout_ms) {
          t.until = now + 100;
          return;
        }
        // Commanded closed but never confirmed: open it again, keep the load
        // safe, and keep this source out of Smart selection for a while.
        this.setContactor(t.to, false);
        this.contactors[t.to].fb = false;
        this.closeFailedUntil[t.to] = now + CLOSE_FAIL_COOLDOWN_MS;
        this.failTransfer("close_failed", now);
        return;
      }
      const deadStart = this.lastOpenAt || t.t0;
      t.timings.close_ms = now - t.closeAt;
      this.active = t.to;
      this.activeSince = now;
      this.transfers.push(now);
      this.openedFor = null;
      const fromNoSource = this.noSourceReported;
      this.noSourceReported = false;
      if (fromNoSource) this.emit("no_source_ended", { data: { to: t.to } });
      this.emit("transfer_completed", {
        from: t.from,
        to: t.to,
        data: {
          reason: t.reason,
          mode: this.mode,
          detect_ms: t.detectMs,
          open_ms: t.timings.open_ms ?? 0,
          dead_ms: t.closeAt - deadStart,
          close_ms: t.timings.close_ms,
        },
      });
      if (t.cmdId) void this.ackCommand(t.cmdId, "completed", { source: t.to });
      this.transfer = null;
    }
  }

  updateState() {
    if (this.lockout) this.state = "lockout";
    else if (this.transfer && (this.transfer.phase !== "prepare" || !this.active))
      this.state = "transferring";
    else if (!this.active) this.state = "no_source";
    else this.state = "normal";
  }

  accumulate(now) {
    const dt = Math.max(0, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.state === "normal" && this.active && this.contactors[this.active].fb) {
      this.nvs.runtime[this.active].s += dt;
      this.nvs.energyWh[this.active] += (this.world.loadW * dt) / 3600;
    }
  }

  // ------------------------------------------------------------- report
  payload(now) {
    const feeding = this.state === "normal" && this.active;
    const r = this.active ? this.reading(this.active) : { v: 0, f: 0 };
    const c = this.cfg();
    const alarms = [];
    if (this.lockout) alarms.push("interlock_mismatch");
    if (!this.settings?.nominal_voltage || !this.settings?.nominal_frequency)
      alarms.push("settings_incomplete");
    return {
      v: 1,
      boot_id: this.bootId,
      seq: ++this.telemetrySeq,
      ts: this.iso(now + this.world.clockSkewMs + this.clockOffsetMs),
      interval_ms: this.intervalMs,
      fw: "emulator-2.0",
      mode: this.mode,
      mode_since: this.iso(this.modeSince + this.world.clockSkewMs + this.clockOffsetMs),
      state: this.state,
      active: this.state === "no_source" ? null : this.active,
      active_since: this.active
        ? this.iso(this.activeSince + this.world.clockSkewMs + this.clockOffsetMs)
        : null,
      sources: Object.fromEntries(
        SOURCES.map((s) => {
          const rd = this.reading(s);
          const q = this.qual[s];
          const need = c.return_delay_s;
          const done = q.goodSince ? Math.min(need, (now - q.goodSince) / 1000) : 0;
          return [
            s,
            {
              v: +rd.v.toFixed(1),
              f: +rd.f.toFixed(2),
              available: rd.v > 20,
              qualified: q.qualified,
              q_elapsed_s: q.qualified ? null : Math.round(done),
              q_required_s: q.qualified ? null : Math.round(need),
              reason: this.reasonFor(s),
            },
          ];
        }),
      ),
      load: feeding
        ? {
            v: +r.v.toFixed(1),
            a: +(this.world.loadW / r.v).toFixed(2),
            w: Math.round(this.world.loadW),
            f: +r.f.toFixed(2),
          }
        : { v: 0, a: 0, w: 0, f: null },
      contactors: structuredClone(this.contactors),
      alarms,
      override: this.override,
      config_version: this.configVersion,
      controller: {
        uptime_s: Math.round((now - (this.bootAt ?? now)) / 1000),
        reset_reason: "power_on",
        temp_c: 41,
        supply_v: 5.02,
        dropped_events: this.droppedEvents,
      },
      rssi: -58,
      energy_wh: Object.fromEntries(SOURCES.map((s) => [s, Math.round(this.nvs.energyWh[s])])),
      runtime: Object.fromEntries(
        SOURCES.map((s) => [
          s,
          { s: Math.round(this.nvs.runtime[s].s), since: this.nvs.runtime[s].since },
        ]),
      ),
      events: [...this.buffer],
    };
  }

  /** One device_ingest round-trip. Returns false while "offline" or on error. */
  async report(now = this.clock.now()) {
    if (now < this.world.offlineUntil) return false; // events stay buffered
    this.world.loadW = Math.max(
      300,
      Math.min(9000, this.world.loadW + (Math.random() - 0.5) * 120),
    );
    const body = this.payload(now);
    let res;
    try {
      res = await this.transport.ingest(body);
    } catch (e) {
      this.log(`ingest failed: ${e.message}`);
      return false;
    }
    const sent = new Set(body.events);
    this.buffer = this.buffer.filter((e) => !sent.has(e));
    if (res.clock_invalid && res.server_time) {
      // NTP unavailable: adopt the server clock.
      this.clockOffsetMs =
        Date.parse(res.server_time) - (this.clock.now() + this.world.clockSkewMs);
      this.log("  ⏱ clock corrected from server_time");
    }
    await this.syncSettings(res.settings_version);
    for (const cmd of res.commands ?? []) await this.handleCommand(cmd);
    return true;
  }

  async syncSettings(version) {
    if (version === null || version === undefined || version <= this.configVersion) return;
    const s = await this.transport.getSettings();
    if (!s) return;
    this.settings = s;
    this.configVersion = s.version;
    this.emit("settings_applied", {
      data: { version: s.version, nominal_set: Boolean(s.nominal_voltage && s.nominal_frequency) },
    });
  }

  // ------------------------------------------------------------- commands
  async ackCommand(id, status, result) {
    this.handled.set(id, { status, result });
    try {
      await this.transport.ack(id, status, result ?? null);
    } catch (e) {
      this.log(`ack failed: ${e.message}`);
    }
  }

  async handleCommand(cmd) {
    const seen = this.handled.get(cmd.id);
    if (seen) {
      // Re-delivered (our ack was lost): repeat the last answer, never re-execute.
      if (seen.status !== "executing") await this.ackCommand(cmd.id, seen.status, seen.result);
      return;
    }
    this.log(`  ⇢ command ${cmd.type} ${JSON.stringify(cmd.payload)}`);
    const now = this.clock.now();
    if (cmd.type === "set_mode") {
      const mode = cmd.payload?.mode;
      if (mode !== "smart" && mode !== "manual")
        return this.ackCommand(cmd.id, "rejected", { reason: "وضع غير معروف" });
      await this.ackCommand(cmd.id, "accepted");
      this.mode = mode;
      this.modeSince = now;
      this.manualChoice = mode === "manual" ? this.active : null;
      this.override = null;
      this.emit("mode_changed", { data: { mode } });
      return this.ackCommand(cmd.id, "completed", { mode });
    }
    if (cmd.type === "set_source") {
      const to = cmd.payload?.source;
      if (!SOURCES.includes(to))
        return this.ackCommand(cmd.id, "rejected", { reason: "مصدر غير معروف" });
      if (this.lockout)
        return this.ackCommand(cmd.id, "rejected", { reason: "النظام مقفل بالحماية" });
      if (this.mode !== "manual")
        return this.ackCommand(cmd.id, "rejected", { reason: "النظام ليس في الوضع اليدوي" });
      if (this.transfer)
        return this.ackCommand(cmd.id, "rejected", { reason: "يوجد تحويل قيد التنفيذ" });
      if (to === this.active)
        return this.ackCommand(cmd.id, "rejected", { reason: "هذا هو المصدر الحالي" });
      if (!this.candidates(now)[to].qualified)
        return this.ackCommand(cmd.id, "rejected", {
          reason: "المصدر غير مؤهل أو خارج الحدود المضبوطة",
        });
      await this.ackCommand(cmd.id, "accepted");
      this.manualChoice = to;
      this.override = null;
      this.startTransfer(to, "manual", now, cmd.id);
      return this.ackCommand(cmd.id, "executing");
    }
    if (cmd.type === "reset_runtime") {
      const list = (cmd.payload?.sources ?? []).filter((s) => SOURCES.includes(s));
      if (!list.length) return this.ackCommand(cmd.id, "rejected", { reason: "لا توجد مصادر" });
      await this.ackCommand(cmd.id, "accepted");
      for (const s of list) this.nvs.runtime[s] = { s: 0, since: this.iso() };
      this.emit("runtime_reset", { data: { sources: list } });
      return this.ackCommand(cmd.id, "completed", { sources: list });
    }
    if (cmd.type === "reset_generator") {
      await this.ackCommand(cmd.id, "accepted");
      const was = this.gen.locked;
      this.gen.locked = false;
      if (was) this.emit("generator_reset", { data: {} });
      return this.ackCommand(cmd.id, "completed", { was_locked: was });
    }
    return this.ackCommand(cmd.id, "rejected", { reason: "أمر غير مدعوم" });
  }

  // ------------------------------------------------------------- on-site / test hooks
  /** On-site reset of a latched lockout (physical button on the panel). */
  clearLockout() {
    if (!this.lockout) return false;
    this.world.interlockWelded = false;
    const src = this.lockout.source;
    this.lockout = null;
    // The welded contactor was repaired: everything is open now.
    for (const s of SOURCES) {
      this.setContactor(s, false);
      this.contactors[s].fb = false;
    }
    if (src) this.lastOpenAt = this.clock.now();
    this.active = null;
    this.transfer = null;
    this.noSourceReported = false;
    this.emit("lockout_cleared", { data: { by: "site_button" } });
    this.updateState();
    return true;
  }

  status() {
    return {
      boot_id: this.bootId,
      mode: this.mode,
      state: this.state,
      active: this.active,
      transfer: this.transfer
        ? `${this.transfer.phase}${this.transfer.sub ? "/" + this.transfer.sub : ""} → ${this.transfer.to}`
        : null,
      world: { ...this.world, stuckOpen: [...this.world.stuckOpen] },
      gen: this.gen,
      configVersion: this.configVersion,
      buffered: this.buffer.length,
    };
  }
}

const FAIL_TEXT = {
  failed_to_start: "فشل تشغيل المولد",
  target_lost: "خرج المصدر الهدف عن الحدود قبل التوصيل",
  close_failed: "لم يتأكد إغلاق الكونتاكتور",
};
