#!/usr/bin/env node
// Smart ATS device emulator — a TEST tool that speaks the real ESP32
// protocol against Supabase.
//
// Configuration (first found wins):
//   1. environment: ATS_SUPABASE_URL, ATS_ANON_KEY, ATS_DEVICE_ID, ATS_DEVICE_TOKEN,
//      ATS_INTERVAL_MS (2000), ATS_TIME_SCALE (10)
//   2. emulator.config.json in the current folder or next to this script
//      (see emulator.config.example.json)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { EmulatedBoard } from "./board.mjs";
import { supabaseTransport } from "./transport-supabase.mjs";

function loadConfig() {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = [
    join(process.cwd(), "emulator.config.json"),
    join(here, "emulator.config.json"),
  ].find(existsSync);
  const json = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  const env = process.env;
  return {
    supabaseUrl: env.ATS_SUPABASE_URL ?? json.supabaseUrl,
    anonKey: env.ATS_ANON_KEY ?? json.anonKey,
    deviceId: env.ATS_DEVICE_ID ?? json.deviceId,
    token: env.ATS_DEVICE_TOKEN ?? json.token,
    intervalMs: Number(env.ATS_INTERVAL_MS ?? json.intervalMs ?? 2000),
    timeScale: Number(env.ATS_TIME_SCALE ?? json.timeScale ?? 10),
    source: file ?? "environment",
  };
}

const HELP = `commands:
  grid on|off|low|high|absent   solar …   gen …   (absent = not installed)
  load <watts>               offline <seconds>          interlock on|off
  contactor <source> stuck|ok   (simulate a contactor that will not close)
  clear                      (on-site reset of a protection lockout)
  clock bad|ok               (board clock at 1970 / NTP back)
  reboot                     status    help    quit`;

const cfg = loadConfig();
const missing = ["supabaseUrl", "anonKey", "deviceId", "token"].filter((k) => !cfg[k]);
if (missing.length) {
  console.error(`Missing configuration: ${missing.join(", ")}.
Create emulator.config.json next to this file (copy emulator.config.example.json)
or set ATS_SUPABASE_URL, ATS_ANON_KEY, ATS_DEVICE_ID and ATS_DEVICE_TOKEN.`);
  process.exit(1);
}

const clock = { now: () => Date.now() };
const board = new EmulatedBoard({
  transport: supabaseTransport(cfg),
  clock,
  intervalMs: cfg.intervalMs,
  timeScale: cfg.timeScale,
  log: (line) => console.log(line),
});

const SOURCES = ["grid", "solar", "generator"];
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const [a, b] = line.trim().split(/\s+/);
  const w = board.world;
  const src = a === "gen" ? "generator" : a;
  if (SOURCES.includes(src) && ["on", "off", "low", "high", "absent"].includes(b)) w[src] = b;
  else if (a === "load" && Number(b) > 0) w.loadW = Number(b);
  else if (a === "offline") w.offlineUntil = Date.now() + (Number(b) || 40) * 1000;
  else if (a === "interlock") w.interlockWelded = b === "on";
  else if (a === "contactor" && SOURCES.includes(b)) {
    const [, , mode] = line.trim().split(/\s+/);
    if (mode === "stuck") w.stuckOpen.add(b);
    else w.stuckOpen.delete(b);
  } else if (a === "clear") console.log(board.clearLockout() ? "lockout cleared" : "no lockout");
  else if (a === "clock") {
    w.clockSkewMs = b === "bad" ? -Date.now() + 600_000 : 0;
    if (b !== "bad") board.clockOffsetMs = 0;
  } else if (a === "reboot") board.reboot();
  else if (a === "status") console.log(board.status());
  else if (a === "quit" || a === "exit") process.exit(0);
  else if (a) console.log(HELP);
});

console.log(
  `Emulating ${cfg.deviceId} → ${cfg.supabaseUrl}\nreport every ${cfg.intervalMs} ms, timers ×${cfg.timeScale} faster (config: ${cfg.source})\n${HELP}`,
);

setInterval(() => board.control(clock.now()), 100);
let reporting = false;
async function reportLoop() {
  if (!reporting) {
    reporting = true;
    try {
      await board.report(clock.now());
    } finally {
      reporting = false;
    }
  }
}
void reportLoop();
setInterval(reportLoop, cfg.intervalMs);
