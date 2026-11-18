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

/** Y domain that always contains every value, padded, never clipping data. */
export function yDomain(samples: Sample[], floor?: number): [number, number] {
  const st = seriesStats(samples);
  if (!st) return [0, 1];
  let lo = floor !== undefined ? Math.min(floor, st.min) : st.min;
  let hi = st.max;
  if (hi - lo < 1e-6) {
    hi += 1;
    lo = Math.max(lo - 1, floor !== undefined ? Math.min(floor, st.min) : -Infinity);
  }
  const pad = (hi - lo) * 0.12;
  return [lo - (lo === 0 ? 0 : pad), hi + pad];
}
