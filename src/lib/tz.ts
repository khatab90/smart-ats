/** Time-zone helpers so "today" follows the board's local midnight (C2). */
const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

function parts(t: number, tz: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(t)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (local - UTC) in ms at instant t. */
function tzOffsetMs(t: number, tz: string) {
  const p = parts(t, tz);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
  );
}

/** UTC instant of local midnight for the day containing t. */
export function startOfDayInTz(t: number, tz: string) {
  const p = parts(t, tz);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  let guess = midnightAsUtc - tzOffsetMs(t, tz);
  guess = midnightAsUtc - tzOffsetMs(guess, tz); // correct across DST changes
  return guess;
}

/** Local midnight n days after the local day containing t. */
export function addDaysInTz(t: number, n: number, tz: string) {
  const start = startOfDayInTz(t, tz);
  return startOfDayInTz(start + n * 86_400_000 + 12 * 3_600_000, tz);
}

export function dayOfMonthInTz(t: number, tz: string) {
  return parts(t, tz).day;
}

/** The phone's own time zone (IANA name), or null if the system does not say. */
export function phoneTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}
