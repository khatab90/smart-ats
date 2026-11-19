import { House, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SOURCE_META } from "../data/meta";
import type { DeviceStatus, SourceId } from "../data/types";
import { cn } from "../lib/cn";
import { installedSources } from "../domain/sources";
import { fmtKw } from "../lib/format";
import { SOURCE_ICON } from "./ui";

const VW = 320;
const VH = 132;
const SRC_X = 290;
const ATS = { x: 160, y: 66 };
const HOME = { x: 34, y: 66 };
const pct = (x: number, y: number) => ({ left: `${(x / VW) * 100}%`, top: `${(y / VH) * 100}%` });

/** Vertical slots for 1–3 installed sources, centred on the ATS line. */
const SLOTS: Record<number, number[]> = { 1: [66], 2: [40, 92], 3: [22, 66, 110] };

const DOTS = 3;

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduce, setReduce] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      return;
    }
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * Seconds for a dot to travel source → home: faster when the load draws more
 * power (0.5 kW ≈ 2.6 s … 5 kW and above ≈ 1.2 s).
 */
export function flowSeconds(loadW: number | null | undefined): number {
  const kw = Math.max(0, (loadW ?? 0) / 1000);
  return Math.round(Math.max(1.2, Math.min(2.6, 2.75 - kw * 0.31)) * 10) / 10;
}

/**
 * Live only: when the board is offline, silent, switching or without a
 * source, nothing moves. Dots travel from the feeding source through the ATS
 * to the house.
 */
export function PowerFlow({ status, live }: { status: DeviceStatus | null; live: boolean }) {
  const shown = installedSources(status);
  const slots = SLOTS[shown.length] ?? SLOTS[3];
  const SRC_Y = Object.fromEntries(shown.map((id, i) => [id, slots[i]])) as Record<
    SourceId,
    number
  >;
  const active =
    live && status?.system_state !== "no_source" ? (status?.active_source ?? null) : null;
  const transferring = live && status?.system_state === "transferring";
  const reduceMotion = usePrefersReducedMotion();
  const dur = flowSeconds(status?.load?.w);
  // One continuous route for the dots: source → ATS → house.
  const flowPath = (y: number) =>
    `M${SRC_X - 22} ${y} C ${ATS.x + 60} ${y}, ${ATS.x + 50} ${ATS.y}, ${ATS.x + 22} ${ATS.y} L ${ATS.x - 22} ${ATS.y} L ${HOME.x + 24} ${ATS.y}`;
  return (
    <div className="relative h-[132px] w-full" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        {shown.map((id) => {
          const y = SRC_Y[id];
          const on = active === id;
          return (
            <path
              key={id}
              d={`M${SRC_X - 22} ${y} C ${ATS.x + 60} ${y}, ${ATS.x + 50} ${ATS.y}, ${ATS.x + 22} ${ATS.y}`}
              fill="none"
              stroke={on ? SOURCE_META[id].color : "rgba(255,255,255,0.14)"}
              strokeWidth={on ? 2.5 : 1.5}
              strokeDasharray={on ? "6 6" : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={on ? "animate-flow" : undefined}
            />
          );
        })}
        {active && !transferring && !reduceMotion && (
          <g key={active}>
            {Array.from({ length: DOTS }, (_, i) => (
              <g key={i}>
                <circle r={6} fill={SOURCE_META[active].color} opacity={0.22}>
                  <animateMotion
                    dur={`${dur}s`}
                    begin={`${(-dur * i) / DOTS}s`}
                    repeatCount="indefinite"
                    path={flowPath(SRC_Y[active])}
                  />
                </circle>
                <circle r={3} fill="#ffffff">
                  <animateMotion
                    dur={`${dur}s`}
                    begin={`${(-dur * i) / DOTS}s`}
                    repeatCount="indefinite"
                    path={flowPath(SRC_Y[active])}
                  />
                </circle>
              </g>
            ))}
          </g>
        )}
        <path
          d={`M${ATS.x - 22} ${ATS.y} H ${HOME.x + 24}`}
          fill="none"
          stroke={active ? "#12b76a" : "rgba(255,255,255,0.14)"}
          strokeWidth={active ? 2.5 : 1.5}
          strokeDasharray={active ? "6 6" : undefined}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={active ? "animate-flow" : undefined}
        />
      </svg>

      {shown.map((id) => {
        const Icon = SOURCE_ICON[id];
        const report = status?.sources?.[id];
        const on = active === id;
        const unavailable = live && report !== undefined && !report?.available;
        return (
          <div
            key={id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={pct(SRC_X, SRC_Y[id])}
          >
            <span
              className={cn(
                "relative flex size-10 items-center justify-center rounded-2xl border transition-all duration-500",
                on
                  ? "border-transparent text-white"
                  : "border-white/15 bg-white/[0.07] text-white/70",
                unavailable && "opacity-45",
              )}
              style={
                on
                  ? {
                      background: SOURCE_META[id].color,
                      boxShadow: `0 0 0 5px ${SOURCE_META[id].color}33, 0 8px 22px -4px ${SOURCE_META[id].color}`,
                    }
                  : undefined
              }
            >
              <Icon className="size-[19px]" strokeWidth={2} />
              {unavailable && (
                <span className="absolute -top-1 -left-1 flex size-4 items-center justify-center rounded-full bg-danger text-white ring-2 ring-brand-900">
                  <X className="size-2.5" strokeWidth={3.5} />
                </span>
              )}
            </span>
          </div>
        );
      })}

      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(ATS.x, ATS.y)}>
        <span
          className={cn(
            "flex h-11 w-12 items-center justify-center rounded-[14px] border text-[11px] font-bold tracking-wide",
            transferring
              ? "border-warn/60 bg-warn/20 text-white"
              : "border-white/25 bg-white/12 text-white",
          )}
          dir="ltr"
        >
          {transferring ? <LoaderCircle className="size-5 animate-spin" /> : "ATS"}
        </span>
      </div>

      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
        style={pct(HOME.x, HOME.y)}
      >
        <span
          className={cn(
            "mx-auto flex size-12 items-center justify-center rounded-full border-2 transition",
            active ? "border-ok bg-ok/20 text-white" : "border-white/20 bg-white/5 text-white/50",
          )}
        >
          <House className="size-5" strokeWidth={2} />
        </span>
        <span
          className="num absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-white/80"
          dir="ltr"
        >
          {active && status?.load?.w !== null && status?.load?.w !== undefined
            ? `${fmtKw(status.load.w)} kW`
            : "—"}
        </span>
      </div>
    </div>
  );
}
