#!/usr/bin/env node
// Smart ATS device emulator — a TEST tool that speaks the real ESP32
// protocol v1 against Supabase. It is not part of the app bundle and only
// works with boards registered as environment = 'test'.
//
//   ATS_DEVICE_ID=ATS-TEST01 ATS_DEVICE_TOKEN=... node tools/device-emulator/emulator.mjs
//
// Optional: ATS_INTERVAL_MS (2000), ATS_TIME_SCALE (1; e.g. 10 = timers 10x faster),
//           ATS_BOOT_SOURCE (grid), ATS_FALLBACK_V (230), ATS_FALLBACK_F (50).
import { readFileSync } from "node:fs";
import readline from "node:readline";
import { SOURCES, mayTransfer, smartTarget, stepQualification } from "./logic.mjs";

const info = readFileSync(new URL("../../utils/supabase/info.tsx", import.meta.url), "utf8");
const projectId = info.match(/projectId = "([^"]+)"/)?.[1];
const anonKey = info.match(/publicAnonKey = "([^"]+)"/)?.[1];
const DEVICE_ID = process.env.ATS_DEVICE_ID;
const TOKEN = process.env.ATS_DEVICE_TOKEN;
if (!projectId || !anonKey || !DEVICE_ID || !TOKEN) {
  console.error("Set ATS_DEVICE_ID and ATS_DEVICE_TOKEN (from register_device on a 'test' board).");
  process.exit(1);
}
const INTERVAL = Number(process.env.ATS_INTERVAL_MS ?? 2000);
const SCALE = Math.max(1, Number(process.env.ATS_TIME_SCALE ?? 1));
const FALLBACK = {
  v: Number(process.env.ATS_FALLBACK_V ?? 230),
  f: Number(process.env.ATS_FALLBACK_F ?? 50),
};
const URL_BASE = `https://${projectId}.supabase.co/rest/v1/rpc`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (t = Date.now()) => new Date(t).toISOString();

async function rpc(fn, args) {
  const res = await fetch(`${URL_BASE}/${fn}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${body?.message ?? ""}`);
  return body;
}

// ---------------------------------------------------------------- state
let settings = null;
let configVersion = 0;
const physical = { grid: "on", solar: "on" }; // on | off | low | high
const gen = { failStart: false, running: false, warmUntil: 0, stopAt: 0, locked: false };
let loadW = 2200;
let interlockFault = false;
let mode = "smart";
let modeSince = Date.now();
let manualChoice = null;
let active = process.env.ATS_BOOT_SOURCE ?? "grid";
let activeSince = Date.now();
let state = "normal";
let override = null;
const transfers = [];
const qual = Object.fromEntries(
  SOURCES.map((s) => [s, { qualified: s === active, badSince: null, goodSince: null, kind: null }]),
);
const contactors = Object.fromEntries(
  SOURCES.map((s) => [s, { cmd: s === active, fb: s === active }]),
);
const energyWh = { grid: 0, solar: 0, generator: 0 };
const runtime = Object.fromEntries(SOURCES.map((s) => [s, { s: 0, since: iso() }]));
let eventSeq = Date.now();
let telemetrySeq = 0;
let buffer = [];
let offlineUntil = 0;
let busy = false;
let lastTick = Date.now();

const cfg = () => ({
  ...(settings ?? {}),
  nominal_voltage: settings?.nominal_voltage ?? FALLBACK.v,
  nominal_frequency: settings?.nominal_frequency ?? FALLBACK.f,
  return_delay_s: (settings?.return_delay_s ?? 120) / SCALE,
  min_dwell_s: (settings?.min_dwell_s ?? 60) / SCALE,
  gen_warmup_s: (settings?.gen_warmup_s ?? 30) / SCALE,
  gen_cooldown_s: (settings?.gen_cooldown_s ?? 180) / SCALE,
});

function emit(type, extra = {}) {
  buffer.push({ seq: ++eventSeq, ts: iso(), type, severity: "info", ...extra });
  console.log(
    `  ↳ event ${type}`,
    extra.source ?? extra.to ?? "",
    extra.data?.reason ?? extra.data?.kind ?? "",
  );
}

function reading(id) {
  const c = cfg();
  const noise = (a) => (Math.random() - 0.5) * a;
  if (id === "generator") {
    if (!gen.running) return { v: 0, f: 0 };
    return { v: c.nominal_voltage - 6 + noise(4), f: c.nominal_frequency + 0.2 + noise(0.2) };
  }
  const p = physical[id];
  if (p === "off") return { v: 0, f: 0 };
  const k = p === "low" ? 0.78 : p === "high" ? 1.14 : 1;
  return { v: c.nominal_voltage * k + noise(3), f: c.nominal_frequency + noise(0.06) };
}

function reasonFor(id) {
  if (id === "generator" && gen.locked) return "failed_to_start";
  if (id === "generator" && !gen.running) return "standby"; // stopped but ready to start
  const q = qual[id];
  return q.qualified ? null : (q.kind ?? "no_voltage");
}

// ---------------------------------------------------------- transfers
async function transfer(to, reason) {
  busy = true;
  const from = active;
  const c = cfg();
  const detectMs = from && qual[from].badSince ? Date.now() - qual[from].badSince : 0;
  state = "transferring";
  emit("transfer_started", { from, to, data: { reason, mode } });

  if (to === "generator" && !gen.running) {
    const ok = await startGenerator();
    if (!ok) {
      emit("transfer_failed", {
        severity: "critical",
        from,
        to,
        data: { reason: "failed_to_start", mode },
      });
      state = from && qual[from].qualified ? "normal" : "no_source";
      if (state === "no_source") enterNoSource();
      busy = false;
      return false;
    }
  }

  const t0 = Date.now();
  if (from) contactors[from].cmd = false;
  await sleep(40);
  if (from) contactors[from].fb = interlockFault; // a welded contact stays closed
  if (interlockFault) {
    state = "lockout";
    emit("interlock_fault", { severity: "critical", source: from, data: { contactor: from } });
    busy = false;
    return false;
  }
  const openMs = Date.now() - t0;
  if (from === "generator") gen.stopAt = Date.now() + c.gen_cooldown_s * 1000;
  active = null;
  await sleep(settings?.neutral_delay_ms ?? 1000);
  const deadStart = t0 + openMs;
  if (!qual[to].qualified) {
    emit("transfer_failed", {
      severity: "critical",
      from,
      to,
      data: { reason: "target_lost", mode },
    });
    enterNoSource();
    busy = false;
    return false;
  }
  const t1 = Date.now();
  contactors[to].cmd = true;
  await sleep(35);
  contactors[to].fb = true;
  const closeMs = Date.now() - t1;
  active = to;
  activeSince = Date.now();
  state = "normal";
  transfers.push(Date.now());
  emit("transfer_completed", {
    from,
    to,
    data: {
      reason,
      mode,
      detect_ms: detectMs,
      open_ms: openMs,
      dead_ms: t1 - deadStart,
      close_ms: closeMs,
    },
  });
  busy = false;
  return true;
}

async function startGenerator() {
  const c = cfg();
  const attempts = settings?.gen_crank_attempts ?? 3;
  for (let i = 1; i <= attempts; i++) {
    console.log(`  … cranking generator (${i}/${attempts})`);
    await sleep(3000 / SCALE);
    if (!gen.failStart) {
      gen.running = true;
      gen.stopAt = 0;
      console.log(`  … warming up ${c.gen_warmup_s}s`);
      await sleep(c.gen_warmup_s * 1000);
      qual.generator = { qualified: true, badSince: null, goodSince: Date.now(), kind: null };
      return true;
    }
    await sleep(2000 / SCALE);
  }
  gen.locked = true;
  return false;
}

function enterNoSource() {
  if (state === "no_source" && active === null) return;
  for (const s of SOURCES) contactors[s].cmd = contactors[s].fb = false;
  active = null;
  state = "no_source";
  emit("no_source_started", {
    severity: "critical",
    data: Object.fromEntries(SOURCES.map((s) => [s, reasonFor(s) ?? "stopped"])),
  });
}

function candidates() {
  return Object.fromEntries(
    SOURCES.map((s) => [
      s,
      { qualified: qual[s].qualified || (s === "generator" && !gen.running && !gen.locked) },
    ]),
  );
}

// --------------------------------------------------------------- loop
async function decide(now) {
  if (busy || state === "lockout") return;
  const c = cfg();
  for (const s of SOURCES) {
    const r = stepQualification(qual[s], reading(s), c, now, s === active);
    qual[s] = r.q;
    if (r.tripped) {
      const wasActive = s === active;
      emit("source_lost", {
        severity: wasActive ? "critical" : "warning",
        source: s,
        data: { was_active: wasActive, reason: r.kind },
      });
      if (r.kind && r.kind !== "no_voltage") {
        emit("electrical_fault", {
          severity: "warning",
          source: s,
          data: { kind: r.kind, value: `${reading(s).v.toFixed(0)} V` },
        });
      }
    }
  }
  if (gen.running && active !== "generator" && gen.stopAt && now > gen.stopAt) {
    gen.running = false;
    qual.generator = { qualified: false, badSince: null, goodSince: null, kind: null };
  }
  if (
    mode === "manual" &&
    settings?.manual_revert_min &&
    now - modeSince > settings.manual_revert_min * 60_000
  ) {
    mode = "smart";
    modeSince = now;
    override = null;
    emit("mode_changed", { data: { mode, reason: "manual_revert" } });
  }

  const activeOk = active ? qual[active].qualified : false;
  const priority = settings?.priority ?? SOURCES;
  if (mode === "manual" && activeOk) return;
  const target = smartTarget(priority, candidates());
  if (!target) {
    if (!activeOk) enterNoSource();
    return;
  }
  const check = mayTransfer({
    active,
    activeQualified: activeOk,
    target,
    activeSince,
    now,
    settings: c,
    recentTransfers: transfers,
  });
  if (!check.ok) {
    if (check.reason === "rate_limit" && state !== "lockout") {
      emit("transfer_lockout", { severity: "warning", data: { kind: "unstable" } });
    }
    return;
  }
  if (state === "no_source") emit("no_source_ended", { data: { to: target } });
  if (mode === "manual" && !activeOk) {
    override = {
      active: true,
      at: iso(),
      reason: qual[active]?.kind ?? "no_voltage",
      requested: manualChoice ?? active,
    };
    emit("protection_override", { severity: "warning", data: override });
  }
  const reason = !activeOk
    ? active
      ? (qual[active].kind ?? "source_lost")
      : "source_lost"
    : "priority_return";
  void transfer(target, reason);
}

function accumulate(now) {
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (state === "normal" && active) {
    runtime[active].s += dt;
    energyWh[active] += (loadW * dt) / 3600;
  }
  loadW = Math.max(300, Math.min(9000, loadW + (Math.random() - 0.5) * 120));
}

function payload(now) {
  const feeding = state === "normal" && active;
  const r = active ? reading(active) : { v: 0, f: 0 };
  return {
    v: 1,
    seq: ++telemetrySeq,
    ts: iso(now),
    interval_ms: INTERVAL,
    fw: "emulator-1.0",
    mode,
    mode_since: iso(modeSince),
    state,
    active: state === "no_source" ? null : active,
    active_since: active ? iso(activeSince) : null,
    sources: Object.fromEntries(
      SOURCES.map((s) => {
        const rd = reading(s);
        const q = qual[s];
        const need = cfg().return_delay_s;
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
            reason: reasonFor(s),
          },
        ];
      }),
    ),
    load: feeding
      ? {
          v: +r.v.toFixed(1),
          a: +(loadW / r.v).toFixed(2),
          w: Math.round(loadW),
          f: +r.f.toFixed(2),
        }
      : { v: 0, a: 0, w: 0, f: null },
    contactors,
    alarms: state === "lockout" ? ["interlock_mismatch"] : [],
    override,
    config_version: configVersion,
    controller: {
      uptime_s: Math.round(process.uptime()),
      reset_reason: "power_on",
      temp_c: 41,
      supply_v: 5.02,
    },
    rssi: -58,
    energy_wh: Object.fromEntries(SOURCES.map((s) => [s, Math.round(energyWh[s])])),
    runtime: Object.fromEntries(
      SOURCES.map((s) => [s, { s: Math.round(runtime[s].s), since: runtime[s].since }]),
    ),
    events: buffer,
  };
}

async function handleCommand(cmd) {
  const ack = (status, result) =>
    rpc("device_ack_command", {
      p_device_id: DEVICE_ID,
      p_token: TOKEN,
      p_command_id: cmd.id,
      p_status: status,
      p_result: result ?? null,
    });
  console.log(`  ⇢ command ${cmd.type}`, JSON.stringify(cmd.payload));
  if (cmd.type === "set_mode") {
    await ack("accepted");
    mode = cmd.payload.mode;
    modeSince = Date.now();
    manualChoice = mode === "manual" ? active : null;
    override = null;
    emit("mode_changed", { data: { mode } });
    return ack("completed", { mode });
  }
  if (cmd.type === "set_source") {
    const to = cmd.payload.source;
    if (mode !== "manual") return ack("rejected", { reason: "النظام ليس في الوضع اليدوي" });
    if (busy) return ack("rejected", { reason: "يوجد تحويل قيد التنفيذ" });
    if (!candidates()[to].qualified)
      return ack("rejected", { reason: "المصدر غير مؤهل أو خارج الحدود المضبوطة" });
    await ack("accepted");
    await ack("executing");
    manualChoice = to;
    override = null;
    const ok = await transfer(to, "manual");
    return ack(ok ? "completed" : "failed", ok ? { source: to } : { reason: "تعذر إكمال التحويل" });
  }
  if (cmd.type === "reset_runtime") {
    await ack("accepted");
    for (const s of cmd.payload.sources) runtime[s] = { s: 0, since: iso() };
    emit("runtime_reset", { data: { sources: cmd.payload.sources } });
    return ack("completed", { sources: cmd.payload.sources });
  }
  return ack("rejected", { reason: "أمر غير مدعوم" });
}

async function syncSettings(version) {
  if (version === null || version === undefined || version <= configVersion) return;
  const s = await rpc("device_get_settings", { p_device_id: DEVICE_ID, p_token: TOKEN });
  settings = s;
  configVersion = s.version;
  emit("settings_applied", {
    data: { version: s.version, nominal_set: Boolean(s.nominal_voltage && s.nominal_frequency) },
  });
}

async function tick() {
  const now = Date.now();
  accumulate(now);
  await decide(now);
  if (now < offlineUntil) return; // buffer events while "disconnected"
  const body = payload(now);
  try {
    const res = await rpc("device_ingest", {
      p_device_id: DEVICE_ID,
      p_token: TOKEN,
      p_payload: body,
    });
    buffer = buffer.filter((e) => !body.events.includes(e));
    await syncSettings(res.settings_version);
    for (const cmd of res.commands ?? [])
      void handleCommand(cmd).catch((e) => console.error("command error", e.message));
  } catch (e) {
    console.error("ingest failed:", e.message);
  }
}

// ---------------------------------------------------------------- CLI
const HELP = `commands:
  grid on|off|low|high     solar on|off|low|high     gen fail|ok
  load <watts>             offline <seconds>         interlock on|off
  status                   help                      quit`;

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const [a, b] = line.trim().split(/\s+/);
  if (a === "grid" || a === "solar") physical[a] = b;
  else if (a === "gen") {
    gen.failStart = b === "fail";
    if (b === "ok") gen.locked = false;
  } else if (a === "load") loadW = Number(b) || loadW;
  else if (a === "offline") offlineUntil = Date.now() + (Number(b) || 40) * 1000;
  else if (a === "interlock") interlockFault = b === "on";
  else if (a === "status")
    console.log({ mode, state, active, physical, gen, configVersion, buffered: buffer.length });
  else if (a === "quit") process.exit(0);
  else console.log(HELP);
});

console.log(`Emulating ${DEVICE_ID} every ${INTERVAL} ms (time scale ×${SCALE}).\n${HELP}`);
settings = await rpc("device_get_settings", { p_device_id: DEVICE_ID, p_token: TOKEN });
configVersion = settings?.version ?? 0;
emit("controller_restarted", { data: { reason: "power_on" } });
setInterval(() => void tick(), INTERVAL);
