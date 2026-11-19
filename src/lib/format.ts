import { startOfDayInTz } from "./tz";

const LOCALE = "ar-EG-u-nu-latn";
const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(kind: string, opts: Intl.DateTimeFormatOptions, tz?: string) {
  const key = `${kind}|${tz ?? ""}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { ...opts, ...(tz ? { timeZone: tz } : {}) });
    cache.set(key, f);
  }
  return f;
}

const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const fmtTime = (t: number, tz?: string) =>
  fmt("time", { hour: "numeric", minute: "2-digit" }, tz).format(t);
export const fmtTimeSec = (t: number, tz?: string) =>
  fmt("timesec", { hour: "numeric", minute: "2-digit", second: "2-digit" }, tz).format(t);
export const fmtDate = (t: number, tz?: string) =>
  fmt("date", { day: "numeric", month: "long" }, tz).format(t);
export const fmtFullDate = (t: number, tz?: string) =>
  fmt("fulldate", { day: "numeric", month: "long", year: "numeric" }, tz).format(t);
export const fmtWeekday = (t: number, tz?: string) =>
  fmt("weekday", { weekday: "long" }, tz).format(t);
export const fmtShortDay = (t: number, tz?: string) =>
  fmt("shortday", { weekday: "short" }, tz).format(t);
export const fmtDateTime = (t: number, tz?: string) =>
  fmt(
    "datetime",
    { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
    tz,
  ).format(t);

/** "اليوم" / "أمس" / weekday + date, in the given time zone. */
export function fmtDayLabel(t: number, now = Date.now(), tz = localTz()) {
  const diff = Math.round((startOfDayInTz(now, tz) - startOfDayInTz(t, tz)) / 86_400_000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return `${fmtWeekday(t, tz)}، ${fmtDate(t, tz)}`;
}

/** Live clock style: 02:14:09 */
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Human duration in Arabic: "3 س 12 د" */
export function fmtDuration(ms: number) {
  // Under a minute, seconds: an 18 s outage must not read "0 د".
  if (ms < 59_500) return `${Math.max(0, Math.round(ms / 1000))} ث`;
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

export function fmtHours(seconds: number) {
  return fmtNum(seconds / 3600, 1);
}

export function fmtAgo(t: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 5) return "الآن";
  if (s < 60) return `منذ ${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  const d = Math.floor(h / 24);
  return d === 1 ? "أمس" : `منذ ${d} أيام`;
}

export const fmtNum = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Formats a nullable reading; null renders as an em dash, never as 0. */
export const fmtReading = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : fmtNum(v, digits);

/** Watts -> kW value string. */
export const fmtKw = (w: number | null | undefined, digits = 2) =>
  w === null || w === undefined || !Number.isFinite(w) ? "—" : fmtNum(w / 1000, digits);

/** Transfer timing measured by the board, in ms or seconds. */
export const fmtMs = (ms: number) =>
  ms >= 1000 ? `${fmtNum(ms / 1000, 1)} s` : `${fmtNum(ms)} ms`;

/**
 * Arabic counted noun: 1 → "جهاز واحد", 2 → "جهازان", 3–10 → "3 أجهزة",
 * 11–99 → "11 جهازاً", 100+ and 0 → "100 جهاز".
 */
export function arCount(
  n: number,
  forms: { one: string; two: string; few: string; many: string; base: string },
): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} ${forms.few}`;
  if (r >= 11 && r <= 99) return `${n} ${forms.many}`;
  return `${n} ${forms.base}`;
}

/** Avatar letter: first letter of the name, else of the email. */
export function initialOf(name: string | null | undefined, email: string | null | undefined) {
  const src = (name ?? "").trim() || (email ?? "").trim();
  return src ? src.charAt(0).toUpperCase() : "؟";
}
