import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn";

const W = 320;

export interface ChartSeries {
  /** Samples already split into continuous segments (gaps between them). */
  segments: { t: number; v: number }[][];
  color: string;
}

/**
 * Time-series line chart. Mirrored for RTL (newest on the left), always
 * clipped to its own area, with optional shaded bands (outages/transfers)
 * and a highlighted safe range.
 */
export function LineChart({
  series,
  from,
  to,
  yMin,
  yMax,
  height = 160,
  bands = [],
  safe,
  className,
}: {
  series: ChartSeries[];
  from: number;
  to: number;
  yMin: number;
  yMax: number;
  height?: number;
  bands?: { from: number; to: number; color: string }[];
  safe?: { from: number; to: number };
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const H = height;
  const span = Math.max(1, to - from);
  const ySpan = Math.max(1e-6, yMax - yMin);
  const x = (t: number) => W - ((t - from) / span) * W;
  const y = (v: number) => H - 4 - ((v - yMin) / ySpan) * (H - 8);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ height }}>
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
              <stop offset="0%" stopColor={s.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        <g clipPath={`url(#${gid}-clip)`}>
          {safe && (
            <rect
              x={0}
              width={W}
              y={clamp(y(safe.to), 0, H)}
              height={Math.max(0, clamp(y(safe.from), 0, H) - clamp(y(safe.to), 0, H))}
              fill="#12b76a"
              opacity={0.08}
            />
          )}
          {bands.map((b, i) => {
            const x1 = clamp(x(b.to), 0, W);
            const x2 = clamp(x(b.from), 0, W);
            return (
              <rect
                key={i}
                x={x1}
                width={Math.max(1.5, x2 - x1)}
                y={0}
                height={H}
                fill={b.color}
                opacity={0.14}
              />
            );
          })}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="#e4e9f2"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((s, k) =>
            s.segments.map((seg, j) => {
              if (seg.length === 0) return null;
              const pts = seg.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
              if (seg.length === 1) {
                return (
                  <circle
                    key={`${k}-${j}`}
                    cx={x(seg[0].t)}
                    cy={y(seg[0].v)}
                    r={1.6}
                    fill={s.color}
                  />
                );
              }
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
                    strokeWidth={2}
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
    </div>
  );
}

export interface Bar {
  key: string;
  label: string;
  segments: { value: number; color: string }[];
}

/** Stacked bar chart. Flex order follows the RTL document direction. */
export function BarChart({
  bars,
  height = 170,
  selected,
  onSelect,
  labelEvery = 1,
  unit = "",
  maxValue,
}: {
  bars: Bar[];
  height?: number;
  selected?: number;
  onSelect?: (i: number) => void;
  labelEvery?: number;
  unit?: string;
  maxValue?: number;
}) {
  const totals = bars.map((b) => b.segments.reduce((a, s) => a + s.value, 0));
  const rawMax = maxValue ?? Math.max(...totals, 0.001);
  const step = niceStep(rawMax / 3);
  const max = step * 3;
  return (
    <div className="flex gap-2">
      <div className="num relative w-7 text-[10px] text-faint" style={{ height }}>
        {[3, 2, 1, 0].map((k) => (
          <span
            key={k}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${((3 - k) / 3) * 100}%` }}
          >
            {formatTick(step * k)}
          </span>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-x-0 top-0" style={{ height }}>
          {[0, 1, 2, 3].map((k) => (
            <div
              key={k}
              className="absolute inset-x-0 border-t border-dashed border-line"
              style={{ top: `${(k / 3) * 100}%` }}
            />
          ))}
        </div>
        <div className="relative flex items-end gap-[3px]" style={{ height }}>
          {bars.map((b, i) => {
            const total = totals[i];
            const active = selected === i;
            const dim = selected !== undefined && !active;
            return (
              <button
                key={b.key}
                type="button"
                aria-label={`${b.label}: ${total.toFixed(1)} ${unit}`}
                onClick={() => onSelect?.(i)}
                className="group flex h-full flex-1 flex-col justify-end"
              >
                <span
                  className={cn(
                    "flex w-full flex-col-reverse overflow-hidden rounded-t-[5px] rounded-b-[2px] transition-opacity",
                    dim && "opacity-35",
                  )}
                  style={{ height: `${(total / max) * 100}%`, minHeight: total > 0 ? 3 : 0 }}
                >
                  {b.segments.map((s, k) =>
                    s.value > 0 ? (
                      <span
                        key={k}
                        style={{ flexGrow: s.value, background: s.color }}
                        className="block min-h-px"
                      />
                    ) : null,
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-[3px]">
          {bars.map((b, i) => (
            <span key={b.key} className="flex min-w-0 flex-1 justify-center">
              <span
                className={cn(
                  "num whitespace-nowrap text-[10px] text-faint",
                  selected === i && "font-bold text-ink",
                )}
              >
                {i % labelEvery === 0 || selected === i ? b.label : ""}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pow;
}

const formatTick = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v % 1 ? v.toFixed(1) : String(v);

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
          stroke="#eef1f6"
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
