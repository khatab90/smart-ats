import { localizeDigits } from "./digits";

/**
 * Builds chart-ready series from raw samples (C7): null readings and time
 * gaps longer than `maxGapMs` break the line; zero readings (outages) are
 * real values and are included in the statistics.
 */
export interface Sample {
  t: number;
  v: number | null;
}

export interface SeriesStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export function splitSegments(samples: Sample[], maxGapMs: number): Sample[][] {
  const segments: Sample[][] = [];
  let current: Sample[] = [];
  let lastT: number | null = null;
  for (const s of samples) {
    const broken =
      s.v === null || !Number.isFinite(s.v) || (lastT !== null && s.t - lastT > maxGapMs);
    if (broken && current.length) {
      segments.push(current);
      current = [];
    }
    if (s.v !== null && Number.isFinite(s.v)) current.push(s);
    lastT = s.t;
  }
  if (current.length) segments.push(current);
  return segments;
}

export function seriesStats(samples: Sample[]): SeriesStats | null {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (s.v === null || !Number.isFinite(s.v)) continue;
    min = Math.min(min, s.v);
    max = Math.max(max, s.v);
    sum += s.v;
    count++;
  }
  return count ? { min, max, avg: sum / count, count } : null;
}

/**
 * Y domain that always contains every value, padded, never clipping data.
 * `floor` forces a lower bound into view (0 for current and power);
 * `include` keeps a reference range visible (the safe voltage band), so a
 * steady 230 V shows its small variation instead of a flat line at the top.
 */
export function yDomain(
  samples: Sample[],
  floor?: number,
  include?: { min: number; max: number },
): [number, number] {
  const st = seriesStats(samples);
  if (!st) return include ? [include.min, include.max] : [0, 1];
  let lo = floor !== undefined ? Math.min(floor, st.min) : st.min;
  let hi = st.max;
  if (include) {
    lo = Math.min(lo, include.min);
    hi = Math.max(hi, include.max);
  }
  if (hi - lo < 1e-6) {
    hi += 1;
    lo = Math.max(lo - 1, floor !== undefined ? Math.min(floor, st.min) : -Infinity);
  }
  const pad = (hi - lo) * 0.12;
  return [lo - (lo === 0 ? 0 : pad), hi + pad];
}

/** 1, 2, 2.5 or 5 × 10ⁿ: the tick step for about `raw` per interval. */
export function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw > 0 ? raw : 1));
  const n = raw / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pow;
}

/** Tick values: multiples of a nice step inside [lo, hi], about `count` of them. */
export function ticksFor(lo: number, hi: number, count = 3): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep((hi - lo) / count);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/**
 * Formats a tick with just enough decimals for its step, so neighbouring
 * ticks never print the same text (0.05 / 0.1 / 0.15, not 0.1 / 0.1 / 0.1).
 */
export function formatTick(v: number, step: number): string {
  if (Math.abs(v) >= 1000 && step >= 1000)
    return localizeDigits(`${Number((v / 1000).toFixed(1))}k`);
  let d = 0;
  while (d < 4 && Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) > 1e-6) d++;
  return localizeDigits(v.toFixed(d));
}
