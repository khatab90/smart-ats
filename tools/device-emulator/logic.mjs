// Pure decision logic shared by the emulator and its unit tests. It encodes
// the reference behaviour expected from the real ESP32 firmware (doc A3/A4):
// per-source qualification with trip/recover bands and delays, priority
// selection with a return-stability delay, minimum dwell and a rate limit.

export const SOURCES = ["grid", "solar", "generator"];

/** Classifies a reading against the configured limits. */
export function classify(reading, s) {
  if (!reading || reading.v === null || reading.v < 20)
    return { ok: false, recovered: false, kind: "no_voltage" };
  const vn = s.nominal_voltage;
  const fn = s.nominal_frequency;
  const vLow = vn * (1 - s.uv_trip_pct / 100);
  const vHigh = vn * (1 + s.ov_trip_pct / 100);
  const fLow = fn * (1 - s.uf_trip_pct / 100);
  const fHigh = fn * (1 + s.of_trip_pct / 100);
  let kind = null;
  if (reading.v < vLow) kind = "undervoltage";
  else if (reading.v > vHigh) kind = "overvoltage";
  else if (reading.f !== null && reading.f < fLow) kind = "underfrequency";
  else if (reading.f !== null && reading.f > fHigh) kind = "overfrequency";
  const recovered =
    kind === null &&
    reading.v >= vn * (1 - s.uv_recover_pct / 100) &&
    reading.v <= vn * (1 + s.ov_recover_pct / 100) &&
    (reading.f === null || Math.abs(reading.f - fn) <= fn * (s.f_recover_pct / 100));
  return { ok: kind === null, recovered, kind };
}

/** Trip delay for a fault kind, in ms. */
export function tripDelayMs(kind, s) {
  if (kind === "undervoltage") return s.uv_delay_ms;
  if (kind === "overvoltage") return s.ov_delay_ms;
  if (kind === "underfrequency" || kind === "overfrequency") return s.f_delay_ms;
  return 0; // loss of voltage trips immediately
}

/**
 * Advances one source's qualification state.
 * q = { qualified, badSince, goodSince, kind }
 */
export function stepQualification(q, reading, s, now, isActive) {
  const c = classify(reading, s);
  const next = { ...q };
  if (!c.ok) {
    next.goodSince = null;
    next.kind = c.kind;
    if (next.badSince === null) next.badSince = now;
    if (next.qualified && now - next.badSince >= tripDelayMs(c.kind, s)) next.qualified = false;
    return { q: next, tripped: q.qualified && !next.qualified, kind: c.kind };
  }
  next.badSince = null;
  if (next.qualified) return { q: next, tripped: false, kind: null };
  if (!c.recovered) {
    next.goodSince = null;
    next.kind = "qualifying";
    return { q: next, tripped: false, kind: null };
  }
  if (next.goodSince === null) next.goodSince = now;
  // The active source (e.g. at boot) qualifies immediately; others must be stable.
  const required = isActive ? 0 : s.return_delay_s * 1000;
  if (now - next.goodSince >= required) {
    next.qualified = true;
    next.kind = null;
  } else {
    next.kind = "qualifying";
  }
  return { q: next, tripped: false, kind: null };
}

/** Smart mode target: first qualified source by priority. */
export function smartTarget(priority, qual) {
  return priority.find((id) => qual[id]?.qualified) ?? null;
}

/**
 * Whether a transfer from `active` to `target` may start now.
 * Leaving a failed source is always allowed; otherwise respect min dwell.
 */
export function mayTransfer({
  active,
  activeQualified,
  target,
  activeSince,
  now,
  settings,
  recentTransfers,
}) {
  if (!target || target === active) return { ok: false, reason: "no_change" };
  if (activeQualified && active && now - activeSince < settings.min_dwell_s * 1000)
    return { ok: false, reason: "dwell" };
  const windowMs = settings.rate_limit_window_min * 60_000;
  const count = recentTransfers.filter((t) => now - t < windowMs).length;
  if (activeQualified && count >= settings.rate_limit_count)
    return { ok: false, reason: "rate_limit" };
  return { ok: true };
}

/**
 * Solar schedule (Smart mode only). `days` are the days a period starts on
 * (0 = Sunday … 6 = Saturday, local time); end < start runs past midnight.
 * Disabled or missing = allowed at any time.
 */
export function solarAllowedAt(schedule, weekday, minutes) {
  if (!schedule?.enabled) return true;
  const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const yesterday = (weekday + 6) % 7;
  return (schedule.periods ?? []).some((p) => {
    const s = toMin(p.start);
    const e = toMin(p.end);
    if (s < e) return p.days.includes(weekday) && minutes >= s && minutes < e;
    return (
      (p.days.includes(weekday) && minutes >= s) || (p.days.includes(yesterday) && minutes < e)
    );
  });
}

/** Local weekday / minutes from UTC milliseconds and the offset sent by the server. */
export function localClock(utcMs, offsetMin) {
  const d = new Date(utcMs + (offsetMin ?? 0) * 60_000);
  return { weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
