import { t } from "../i18n";
/**
 * Solar schedule: the hours when Smart mode may use solar.
 *
 * Mirrors the board's rule (the reference board in smart-ats-simulator) and the DB
 * check (_valid_solar_schedule). Both implementations run the shared
 * vectors in protocol/logic-vectors.json ("schedule").
 *
 * - `days` are the days a period STARTS on: 0 = Sunday … 6 = Saturday,
 *   in the device's local time.
 * - `end` earlier than `start` means the period runs past midnight.
 * - Disabled = solar allowed at any time. Manual mode ignores the schedule.
 */
export interface SchedulePeriod {
  days: number[];
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface SolarSchedule {
  enabled: boolean;
  periods: SchedulePeriod[];
}

export const MAX_PERIODS = 8;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Display order for an Iraqi week (Saturday first). */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;
export const DAY_SHORT: Record<number, string> = {
  0: t("أحد"),
  1: t("اثنين"),
  2: t("ثلاثاء"),
  3: t("أربعاء"),
  4: t("خميس"),
  5: t("جمعة"),
  6: t("سبت"),
};

const DEFAULT_SCHEDULE: SolarSchedule = { enabled: false, periods: [] };
export const DEFAULT_PERIOD: SchedulePeriod = { days: [...ALL_DAYS], start: "08:00", end: "17:00" };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether solar may be used at local `weekday` (0–6) and `minutes` since midnight. */
export function solarAllowedAt(
  schedule: SolarSchedule | null | undefined,
  weekday: number,
  minutes: number,
): boolean {
  if (!schedule?.enabled) return true;
  const yesterday = (weekday + 6) % 7;
  return schedule.periods.some((p) => {
    const s = toMinutes(p.start);
    const e = toMinutes(p.end);
    if (s < e) return p.days.includes(weekday) && minutes >= s && minutes < e;
    return (
      (p.days.includes(weekday) && minutes >= s) || (p.days.includes(yesterday) && minutes < e)
    );
  });
}

/** Local weekday and minutes for an instant in an IANA time zone. */
export function localClock(ms: number, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Arabic validation message, or null when valid (same rules as the DB check). */
export function validateSchedule(s: SolarSchedule): string | null {
  if (!s.enabled) return null;
  if (s.periods.length === 0)
    return t("أضف فترة واحدة على الأقل لأوقات الطاقة الشمسية، أو أوقف التقييد.");
  if (s.periods.length > MAX_PERIODS) return t("الحد الأقصى {0} فترات.", { 0: MAX_PERIODS });
  for (const [i, p] of s.periods.entries()) {
    const n = i + 1;
    if (!TIME_RE.test(p.start) || !TIME_RE.test(p.end))
      return t("الفترة {0}: صيغة الوقت غير صحيحة.", { 0: n });
    if (p.start === p.end) return t("الفترة {0}: وقت البداية يساوي وقت النهاية.", { 0: n });
    if (p.days.length === 0) return t("الفترة {0}: اختر يوماً واحداً على الأقل.", { 0: n });
    if (p.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      return t("الفترة {0}: يوم غير صحيح.", { 0: n });
  }
  return null;
}

/** Short Arabic description of one period, e.g. "كل الأيام 08:00 – 17:00". */
export function describePeriod(p: SchedulePeriod): string {
  const days =
    p.days.length === 7
      ? t("كل الأيام")
      : WEEK_ORDER.filter((d) => p.days.includes(d))
          .map((d) => DAY_SHORT[d])
          .join(t("، "));
  const overnight = toMinutes(p.end) < toMinutes(p.start) ? t(" (حتى اليوم التالي)") : "";
  return `${days} ${p.start} – ${p.end}${overnight}`;
}

export function asSchedule(value: unknown): SolarSchedule {
  const v = value as Partial<SolarSchedule> | null;
  return v && typeof v.enabled === "boolean" && Array.isArray(v.periods)
    ? { enabled: v.enabled, periods: v.periods }
    : DEFAULT_SCHEDULE;
}
