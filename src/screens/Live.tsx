import { Activity, Waves, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { LineChart } from "../components/charts";
import { Card, ErrorState, Segmented, Skeleton } from "../components/ui";
import {
  NoDevice,
  PageHeading,
  WaitingForBoard,
  useAwaitingFirstData,
} from "../components/DeviceGate";
import { SOURCE_META } from "../data/meta";
import type { DeviceSettings, SourceId, TelemetryRow } from "../data/types";
import { useTelemetryWindow } from "../hooks/data";
import { installedSources, isFeeding } from "../domain/sources";
import { cn } from "../lib/cn";
import { fmtNum, fmtReading, fmtTimeSec } from "../lib/format";
import { seriesStats, splitSegments, yDomain, type Sample } from "../lib/series";
import { useActiveDevice, useNow } from "../store/devices";
import { LinkBadge } from "../components/status";
import { t, uiStart } from "../i18n";

type Channel = "load" | SourceId;
type Metric = "v" | "a" | "kw" | "f";

const WINDOW_MS = 3 * 60_000;
const OUTAGE = "#e5372b";
const TRANSFER = "#f27a1a";
const CHANNEL_COLOR: Record<Channel, string> = {
  load: "#12b76a",
  grid: SOURCE_META.grid.color,
  solar: SOURCE_META.solar.color,
  generator: SOURCE_META.generator.color,
};
const METRIC: Record<Metric, { label: string; unit: string; digits: number }> = {
  v: { label: t("الجهد"), unit: "V", digits: 0 },
  a: { label: t("التيار"), unit: "A", digits: 1 },
  kw: { label: t("القدرة"), unit: "kW", digits: 2 },
  f: { label: t("التردد"), unit: "Hz", digits: 1 },
};

/** One reading from a telemetry row; source current/power use the shared feeding rule. */
function readRow(r: TelemetryRow, ch: Channel, m: Metric): number | null {
  if (ch === "load") {
    if (m === "v") return r.load_voltage;
    if (m === "a") return r.load_current;
    if (m === "kw") return r.load_power_w === null ? null : r.load_power_w / 1000;
    return r.load_frequency;
  }
  if (m === "v") return r[`${ch}_voltage`];
  if (m === "f") return r[`${ch}_frequency`];
  if (!isFeeding(ch, r.active_source, r.system_state)) return null;
  if (m === "a") return r.load_current;
  return r.load_power_w === null ? null : r.load_power_w / 1000;
}

export function safeVoltageRange(s: DeviceSettings | null): { min: number; max: number } | null {
  if (!s?.nominal_voltage) return null;
  return {
    min: Math.round(s.nominal_voltage * (1 - s.uv_trip_pct / 100)),
    max: Math.round(s.nominal_voltage * (1 + s.ov_trip_pct / 100)),
  };
}

export function Live() {
  const { device, status, settings, link, serverNow } = useActiveDevice();
  const [channel, setChannel] = useState<Channel>("load");
  const [metric, setMetric] = useState<Metric>("v");
  const telemetry = useTelemetryWindow(device?.id ?? null, WINDOW_MS);
  const awaiting = useAwaitingFirstData();
  if (channel !== "load" && !installedSources(status).includes(channel)) setChannel("load");
  useNow(2000);
  const live = link === "live" || link === "stale";
  const color = CHANNEL_COLOR[channel];
  const range = safeVoltageRange(settings);
  const tz = settings?.timezone;

  // Current readings come from the latest board status (hidden when offline).
  const current = useMemo(() => {
    if (!live || !status) return { v: null, a: null, kw: null, f: null };
    if (channel === "load") {
      const l = status.load;
      return {
        v: l?.v ?? null,
        a: l?.a ?? null,
        kw: l?.w === null || l?.w === undefined ? null : l.w / 1000,
        f: l?.f ?? null,
      };
    }
    const r = status.sources?.[channel];
    const feeding = isFeeding(channel, status.active_source, status.system_state);
    return {
      v: r?.v ?? null,
      f: r?.f ?? null,
      a: feeding ? (status.load?.a ?? null) : null,
      kw:
        feeding && status.load?.w !== null && status.load?.w !== undefined
          ? status.load.w / 1000
          : null,
    };
  }, [live, status, channel]);

  const feedingNote =
    channel !== "load" && live && status?.active_source !== channel
      ? t(
          "التيار والقدرة يُقاسان على جهة الحمل، ويظهران لهذا المصدر فقط عندما يكون هو المصدر الفعّال.",
        )
      : null;

  const now = serverNow();
  const from = now - WINDOW_MS;
  // During a total outage the load has no power: the line breaks there and a
  // red band marks it, so the zeros do not squash the scale of the rest.
  const samples: Sample[] = telemetry.data.map((r) => ({
    t: Date.parse(r.device_ts),
    v: channel === "load" && r.system_state === "no_source" ? null : readRow(r, channel, metric),
  }));
  const interval = status?.interval_ms ?? 2000;
  const segments = splitSegments(samples, Math.max(3 * interval, 6000));
  const stats = seriesStats(samples);
  // Voltage keeps the safe band in view (a dip to 0 during an outage still
  // stretches the scale); current and power always start at 0.
  const [y0, y1] = yDomain(
    samples,
    metric === "a" || metric === "kw" ? 0 : undefined,
    metric === "v" && range ? range : undefined,
  );
  const bands = useMemo(() => {
    const out: { from: number; to: number; color: string }[] = [];
    let open: { from: number; color: string } | null = null;
    for (const r of telemetry.data) {
      const t = Date.parse(r.device_ts);
      const color2 =
        r.system_state === "no_source"
          ? OUTAGE
          : r.system_state === "transferring"
            ? TRANSFER
            : null;
      if (color2 && !open) open = { from: t, color: color2 };
      if (!color2 && open) {
        out.push({ ...open, to: t });
        open = null;
      }
    }
    if (open)
      out.push({
        ...open,
        to: telemetry.data.length
          ? Date.parse(telemetry.data[telemetry.data.length - 1].device_ts)
          : open.from,
      });
    return out;
  }, [telemetry.data]);
  const mm = METRIC[metric];

  if (!device || awaiting) {
    return (
      <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
        <PageHeading title={t("المراقبة")} subtitle={t("القراءات الكهربائية اللحظية من البورد")} />
        {device ? (
          <WaitingForBoard compact />
        ) : (
          <NoDevice icon={Activity} body={t("أضف جهازاً لعرض القراءات اللحظية.")} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{t("المراقبة")}</h1>
          <p className="text-[13px] text-muted">{t("القراءات الكهربائية اللحظية من البورد")}</p>
        </div>
        <LinkBadge link={link} />
      </div>

      <Segmented
        value={channel}
        onChange={setChannel}
        options={[
          { value: "load" as Channel, label: t("الحمل") },
          ...installedSources(status).map((id) => ({
            value: id as Channel,
            label: SOURCE_META[id].short,
          })),
        ]}
      />

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0">
        <section className="hero-surface relative overflow-hidden rounded-[28px] px-5 py-5 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="hero-grid absolute inset-0" />
          <div className="relative flex items-center justify-between">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
              <span className="size-2 rounded-full" style={{ background: color }} />
              {channel === "load"
                ? t("القدرة المسحوبة")
                : t("قدرة {0}", { 0: SOURCE_META[channel].name })}
            </p>
            <span className="num text-[11px] text-white/50" dir="ltr">
              {live && status?.device_ts ? fmtTimeSec(Date.parse(status.device_ts), tz) : "—"}
            </span>
          </div>
          <p
            className={cn(
              "num relative mt-5 text-center text-[46px] leading-none font-bold tracking-tight",
              current.kw === null && "text-white/45",
            )}
            dir="ltr"
          >
            {fmtReading(current.kw, 2)}
            <span className="ms-1 text-base font-medium text-white/60">kW</span>
          </p>
          <p className="relative mt-2 text-center text-[12px] text-white/55">
            {!live ? (
              link === "never" ? (
                t("لا توجد بيانات حالياً")
              ) : (
                t("البورد غير متصل — لا توجد قراءات حية")
              )
            ) : feedingNote ? (
              t("هذا المصدر لا يغذي الحمل حالياً")
            ) : (
              <span dir="ltr">{fmtReading(current.f, 2)} Hz</span>
            )}
          </p>
        </section>

        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <Tile icon={Zap} label={t("الجهد")} value={fmtReading(current.v)} unit="V" color={color}>
            {range ? (
              <bdi>
                {range.min}–{range.max} V
              </bdi>
            ) : (
              t("غير مضبوط")
            )}
          </Tile>
          <Tile
            icon={Waves}
            label={t("التيار")}
            value={fmtReading(current.a, 1)}
            unit="A"
            color={color}
          />
          <Tile
            icon={Activity}
            label={t("التردد")}
            value={fmtReading(current.f, 1)}
            unit="Hz"
            color={color}
          >
            {settings?.nominal_frequency ? (
              <>
                {t("الاسمي")} <bdi>{settings.nominal_frequency} Hz</bdi>
              </>
            ) : (
              t("غير مضبوط")
            )}
          </Tile>
        </div>
      </div>
      {feedingNote && <p className="px-1 text-[11px] leading-5 text-muted">{feedingNote}</p>}

      <Card className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold text-ink">{t("آخر 3 دقائق")}</p>
            <p className="text-[12px] text-muted">{t("كيف تغيّرت القراءة")}</p>
          </div>
          <div className="text-end">
            <p className="text-[11px] text-muted">{t("الآن")}</p>
            <p className="num text-[16px] font-bold" style={{ color }}>
              <bdi>
                {fmtReading(current[metric], mm.digits)} {mm.unit}
              </bdi>
            </p>
          </div>
        </div>
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { value: "v", label: t("الجهد") },
            { value: "a", label: t("التيار") },
            { value: "kw", label: t("القدرة") },
            { value: "f", label: t("التردد") },
          ]}
        />
        <div className="mt-5">
          {telemetry.error ? (
            <ErrorState message={telemetry.error} onRetry={telemetry.reload} />
          ) : telemetry.loading ? (
            <Skeleton className="h-[180px]" />
          ) : segments.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center rounded-2xl bg-canvas px-6 text-center text-[13px] text-muted">
              {t("لا توجد قراءات لهذا القياس خلال آخر 3 دقائق.")}
            </div>
          ) : (
            <LineChart
              series={[
                {
                  segments: segments.map((s) => s.map((p) => ({ t: p.t, v: p.v as number }))),
                  color,
                },
              ]}
              from={from}
              to={now}
              yMin={y0}
              yMax={y1}
              bands={bands}
              limits={
                metric === "v" && range
                  ? [
                      { value: range.max, label: t("الحد الأعلى {0}", { 0: range.max }) },
                      { value: range.min, label: t("الحد الأدنى {0}", { 0: range.min }) },
                    ]
                  : []
              }
              xLabels={[
                { t: now, label: t("الآن") },
                { t: now - 60_000, label: t("قبل دقيقة") },
                { t: now - 120_000, label: t("قبل دقيقتين") },
                { t: now - WINDOW_MS, label: t("قبل 3 دقائق") },
              ]}
            />
          )}
        </div>
        {bands.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
            {bands.some((b) => b.color === OUTAGE) && (
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-danger/30" /> {t("انقطاع الكهرباء")}
              </span>
            )}
            {bands.some((b) => b.color === TRANSFER) && (
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-warn/30" /> {t("تحويل بين المصادر")}
              </span>
            )}
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { l: t("الأدنى"), v: stats?.min },
            { l: t("المتوسط"), v: stats?.avg },
            { l: t("الأعلى"), v: stats?.max },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl bg-canvas py-2.5">
              <p className="text-[11px] text-muted">{s.l}</p>
              <p className="num mt-0.5 text-[15px] font-bold text-ink">
                <bdi>
                  {s.v === undefined ? "—" : fmtNum(s.v, mm.digits)}{" "}
                  <span className="text-[11px] font-medium text-muted">{mm.unit}</span>
                </bdi>
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  unit,
  color,
  children,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  unit: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" style={{ color }} />
        <span className="truncate text-[12px] font-semibold text-muted">{label}</span>
      </div>
      <p
        className="num mt-2 truncate text-[20px] leading-none font-bold text-ink"
        dir="ltr"
        style={{ textAlign: uiStart() }}
      >
        {value}
        <span className="ms-0.5 text-[11px] font-medium text-muted">{unit}</span>
      </p>
      {children && <p className="num mt-1.5 truncate text-[10px] text-faint">{children}</p>}
    </Card>
  );
}
