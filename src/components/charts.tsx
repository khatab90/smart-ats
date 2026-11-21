import { useId, type ReactNode } from "react";
import { isRtl } from "../i18n";
import { cn } from "../lib/cn";
import { formatTick, niceStep, ticksFor } from "../lib/series";

const W = 320;

export interface ChartSeries {
  /** Samples already split into continuous segments (gaps between them). */
  segments: { t: number; v: number }[][];
  color: string;
}

/**
 * Time-series line chart, kept deliberately plain: one line, its latest
 * point marked, light gridlines, optional limit lines (the allowed voltage
 * range) and shaded bands for outages/transfers. Mirrored for RTL (newest on
 * the left in Arabic), always clipped to its own area.
 */
export function LineChart({
  series,
  from,
  to,
  yMin,
  yMax,
  height = 180,
  bands = [],
  limits = [],
  xLabels = [],
  className,
}: {
  series: ChartSeries[];
  from: number;
  to: number;
  yMin: number;
  yMax: number;
  height?: number;
  bands?: { from: number; to: number; color: string }[];
  /** Horizontal reference lines, e.g. the allowed minimum and maximum. */
  limits?: { value: number; label: string }[];
  /** Time labels under the chart (the newest time is on the left in Arabic). */
  xLabels?: { t: number; label: string }[];
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const H = height;
  const span = Math.max(1, to - from);
  const ySpan = Math.max(1e-6, yMax - yMin);
  // Time runs with the reading direction: newest at the start side's end
  // (left in Arabic, right in English), as in the bar charts.
  const rtl = isRtl();
  const x = (t: number) => (rtl ? W - ((t - from) / span) * W : ((t - from) / span) * W);
  const y = (v: number) => H - 6 - ((v - yMin) / ySpan) * (H - 12);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const ticks = ticksFor(yMin, yMax, 3);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : niceStep(ySpan / 3);
  const pct = (v: number) => `${(clamp(y(v), 0, H) / H) * 100}%`;
  // The newest point of the first series, marked with a dot.
  const lastSeg = series[0]?.segments[series[0].segments.length - 1];
  const last = lastSeg?.[lastSeg.length - 1];
  return (
    <div className={cn("flex gap-2", className)}>
      <div className="num relative w-8 shrink-0 text-[11px] text-faint" style={{ height }}>
        {ticks.map((v) => (
          <span key={v} className="absolute end-0 -translate-y-1/2" style={{ top: pct(v) }}>
            {formatTick(v, step)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative overflow-hidden" style={{ height }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            <defs>
              <clipPath id={`${gid}-clip`}>
                <rect x="0" y="0" width={W} height={H} />
              </clipPath>
              {series.map((s, k) => (
                <linearGradient key={k} id={`${gid}-g${k}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            <g clipPath={`url(#${gid}-clip)`}>
              {ticks.map((v) => (
                <line
                  key={v}
                  x1={0}
                  x2={W}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--color-line)"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {bands.map((b, i) => {
                const x1 = clamp(Math.min(x(b.from), x(b.to)), 0, W);
                const x2 = clamp(Math.max(x(b.from), x(b.to)), 0, W);
                return (
                  <rect
                    key={i}
                    x={x1}
                    width={Math.max(2, x2 - x1)}
                    y={0}
                    height={H}
                    fill={b.color}
                    opacity={0.16}
                  />
                );
              })}
              {limits.map((l) => (
                <line
                  key={l.value}
                  x1={0}
                  x2={W}
                  y1={y(l.value)}
                  y2={y(l.value)}
                  stroke="#f27a1a"
                  strokeDasharray="5 4"
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {series.map((s, k) =>
                s.segments.map((seg, j) => {
                  if (seg.length === 0) return null;
                  if (seg.length === 1) {
                    return (
                      <circle
                        key={`${k}-${j}`}
                        cx={x(seg[0].t)}
                        cy={y(seg[0].v)}
                        r={1.8}
                        fill={s.color}
                      />
                    );
                  }
                  const pts = seg.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
                  const line = `M${pts.join(" L")}`;
                  return (
                    <g key={`${k}-${j}`}>
                      {k === 0 && (
                        <path
                          d={`${line} L${x(seg[seg.length - 1].t)},${H} L${x(seg[0].t)},${H} Z`}
                          fill={`url(#${gid}-g${k})`}
                        />
                      )}
                      <path
                        d={line}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                }),
              )}
            </g>
          </svg>
          {/* Limit labels and the latest-point dot are HTML so they never stretch. */}
          {limits.map((l) => (
            <span
              key={l.value}
              className="num absolute start-1 -translate-y-[calc(100%+2px)] rounded bg-surface/80 px-1 text-[10px] font-semibold text-warn-strong"
              style={{ top: pct(l.value) }}
            >
              {l.label}
            </span>
          ))}
          {last && (
            <span
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
              style={{
                left: `${(clamp(x(last.t), 0, W) / W) * 100}%`,
                top: pct(last.v),
                background: series[0].color,
              }}
            />
          )}
        </div>
        {xLabels.length > 0 && (
          <div className="num relative mt-1.5 h-4 text-[11px] text-faint">
            {xLabels.map((l) => {
              const p = (clamp(x(l.t), 0, W) / W) * 100;
              const shift = p < 2 ? "0" : p > 98 ? "-100%" : "-50%";
              return (
                <span
                  key={l.t}
                  className="absolute top-0 whitespace-nowrap"
                  style={{ left: `${p}%`, transform: `translateX(${shift})` }}
                >
                  {l.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export interface Bar {
  key: string;
  /** Label under the bar (shown every `labelEvery` bars). */
  label: string;
  value: number;
  /** A period that has not started yet (rest of today): drawn as an empty slot. */
  future?: boolean;
}

/**
 * Bar chart with one plain colour. The selected bar is solid and shows its
 * value above it; the others fade so the selection is obvious. Flex order
 * follows the document direction (first bar on the right in Arabic).
 */
export function BarChart({
  bars,
  height = 180,
  selected,
  onSelect,
  labelEvery = 1,
  unit = "",
  color = "var(--color-brand-500)",
  formatValue = (v: number) => v.toFixed(1),
}: {
  bars: Bar[];
  height?: number;
  selected?: number;
  onSelect?: (i: number) => void;
  labelEvery?: number;
  unit?: string;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const step = niceStep(Math.max(...bars.map((b) => b.value), 0.001) / 3);
  const max = step * 3;
  return (
    <div className="flex gap-2">
      <div className="num relative w-8 shrink-0 text-[11px] text-faint" style={{ height }}>
        {[3, 2, 1, 0].map((k) => (
          <span
            key={k}
            className="absolute end-0 -translate-y-1/2"
            style={{ top: `${((3 - k) / 3) * 100}%` }}
          >
            {formatTick(step * k, step)}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-0 top-0" style={{ height }}>
          {[0, 1, 2, 3].map((k) => (
            <div
              key={k}
              className={cn(
                "absolute inset-x-0 border-t",
                k === 3 ? "border-line" : "border-line/60",
              )}
              style={{ top: `${(k / 3) * 100}%` }}
            />
          ))}
        </div>
        <div
          className={cn("relative flex items-end", bars.length > 12 ? "gap-[3px]" : "gap-2")}
          style={{ height }}
        >
          {bars.map((b, i) => {
            const active = selected === i;
            const dim = selected !== undefined && !active;
            const h = (b.value / max) * 100;
            return (
              <button
                key={b.key}
                type="button"
                aria-label={`${b.label}: ${formatValue(b.value)} ${unit}`}
                aria-pressed={active}
                disabled={b.future}
                onClick={() => onSelect?.(i)}
                className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                {active && (
                  <span
                    className="num absolute start-1/2 z-10 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-surface rtl:translate-x-1/2"
                    style={{ bottom: `calc(${h}% + 6px)` }}
                  >
                    {formatValue(b.value)}
                  </span>
                )}
                {b.future ? (
                  <span className="block h-1 w-full rounded-full bg-track" />
                ) : (
                  <span
                    className={cn(
                      "block w-full rounded-t-md rounded-b-sm transition-opacity",
                      dim && "opacity-35",
                    )}
                    style={{
                      height: `${h}%`,
                      minHeight: b.value > 0 ? 4 : 2,
                      background: b.value > 0 ? color : "var(--color-track)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className={cn("mt-2 flex", bars.length > 12 ? "gap-[3px]" : "gap-2")}>
          {bars.map((b, i) => (
            <span key={b.key} className="relative flex h-4 min-w-0 flex-1 justify-center">
              {(selected === i ||
                (i % labelEvery === 0 &&
                  (selected === undefined ||
                    Math.abs(selected - i) > (labelEvery > 1 ? 2 : 0)))) && (
                <span
                  className={cn(
                    "num absolute whitespace-nowrap text-[11px]",
                    selected === i ? "font-bold text-ink" : "text-faint",
                  )}
                >
                  {b.label}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Donut({
  segments,
  size = 132,
  thickness = 16,
  children,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-track)"
          strokeWidth={thickness}
        />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className="transition-all duration-700"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
