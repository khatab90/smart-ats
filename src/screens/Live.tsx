import { Activity, Gauge, Waves, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { LineChart } from "../components/charts";
import { Card, Chips, EmptyState, ErrorState, Segmented, Skeleton } from "../components/ui";
import { SOURCE_META } from "../data/meta";
import type { DeviceSettings, SourceId, TelemetryRow } from "../data/types";
import { useTelemetryWindow } from "../hooks/data";
import { installedSources, isFeeding } from "../domain/sources";
import { cn } from "../lib/cn";
import { fmtNum, fmtReading, fmtTimeSec } from "../lib/format";
import { seriesStats, splitSegments, yDomain, type Sample } from "../lib/series";
import { useActiveDevice, useNow } from "../store/devices";
import { LinkBadge } from "../components/status";

type Channel = "load" | SourceId;
type Metric = "v" | "a" | "kw" | "f";

const WINDOW_MS = 3 * 60_000;
const CHANNEL_COLOR: Record<Channel, string> = {
  load: "#12b76a",
  grid: SOURCE_META.grid.color,
  solar: SOURCE_META.solar.color,
  generator: SOURCE_META.generator.color,
};
const METRIC: Record<Metric, { label: string; unit: string; digits: number }> = {
  v: { label: "الجهد", unit: "V", digits: 0 },
  a: { label: "التيار", unit: "A", digits: 1 },
  kw: { label: "القدرة", unit: "kW", digits: 2 },
  f: { label: "التردد", unit: "Hz", digits: 2 },
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
      ? "التيار والقدرة يُقاسان على جهة الحمل، ويظهران لهذا المصدر فقط عندما يكون هو المصدر الفعّال."
      : null;

  const now = serverNow();
  const from = now - WINDOW_MS;
  const samples: Sample[] = telemetry.data.map((r) => ({
    t: Date.parse(r.device_ts),
    v: readRow(r, channel, metric),
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
          ? "#e5372b"
          : r.system_state === "transferring"
            ? "#f27a1a"
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

  if (!device) {
    return (
      <div className="px-5 pt-16">
        <EmptyState icon={Activity} title="لا يوجد جهاز" body="أضف جهازاً لعرض القراءات اللحظية." />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pt-4 pb-32">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">المراقبة</h1>
          <p className="text-[13px] text-muted">القراءات الكهربائية اللحظية من البورد</p>
        </div>
        <LinkBadge link={link} />
      </div>

      <Chips
        value={channel}
        onChange={setChannel}
        options={[
          { value: "load" as Channel, label: "الخرج (الحمل)" },
          ...installedSources(status).map((id) => ({
            value: id as Channel,
            label: SOURCE_META[id].short,
          })),
        ]}
      />

      <section className="hero-surface relative overflow-hidden rounded-[28px] px-5 py-5 text-white">
        <div className="hero-grid absolute inset-0" />
        <div className="relative flex items-center justify-between">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
            <span className="size-2 rounded-full" style={{ background: color }} />
            {channel === "load" ? "القدرة المسحوبة" : `قدرة ${SOURCE_META[channel].name}`}
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
              "لا توجد بيانات حالياً"
            ) : (
              "البورد غير متصل — لا توجد قراءات حية"
            )
          ) : feedingNote ? (
            "هذا المصدر لا يغذي الحمل حالياً"
          ) : (
            <span dir="ltr">{fmtReading(current.f, 2)} Hz</span>
          )}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Tile icon={Zap} label="الجهد" value={fmtReading(current.v)} unit="V" color={color}>
          <p className="text-[10px] text-muted">
            {range ? (
              <>
                النطاق المسموح{" "}
                <bdi>
                  {range.min}–{range.max} V
                </bdi>
              </>
            ) : (
              "لم يُضبط الجهد الاسمي في الإعدادات"
            )}
          </p>
        </Tile>
        <Tile icon={Waves} label="التيار" value={fmtReading(current.a, 1)} unit="A" color={color} />
        <Tile
          icon={Gauge}
          label="القدرة"
          value={fmtReading(current.kw, 2)}
          unit="kW"
          color={color}
        />
        <Tile
          icon={Activity}
          label="التردد"
          value={fmtReading(current.f, 2)}
          unit="Hz"
          color={color}
        >
          <p className="text-[10px] text-muted">
            {settings?.nominal_frequency ? (
              <>
                الاسمي <span dir="ltr">{settings.nominal_frequency} Hz</span>
              </>
            ) : (
              "لم يُضبط التردد الاسمي"
            )}
          </p>
        </Tile>
      </div>
      {feedingNote && <p className="px-1 text-[11px] leading-5 text-muted">{feedingNote}</p>}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-bold text-ink">الرسم البياني التفصيلي</p>
          <span className="text-[11px] text-muted">آخر 3 دقائق</span>
        </div>
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { value: "v", label: "الجهد" },
            { value: "a", label: "التيار" },
            { value: "kw", label: "القدرة" },
            { value: "f", label: "التردد" },
          ]}
        />
        <div className="mt-4">
          {telemetry.error ? (
            <ErrorState message={telemetry.error} onRetry={telemetry.reload} />
          ) : telemetry.loading ? (
            <Skeleton className="h-[160px]" />
          ) : segments.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center rounded-2xl bg-canvas px-6 text-center text-[13px] text-muted">
              لا توجد قراءات لهذا القياس خلال آخر 3 دقائق.
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
              safe={metric === "v" && range ? { from: range.min, to: range.max } : undefined}
              xLabels={[
                { t: now, label: "الآن" },
                { t: now - 60_000, label: "قبل دقيقة" },
                { t: now - 120_000, label: "قبل دقيقتين" },
                { t: now - WINDOW_MS, label: "قبل 3 د" },
              ]}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-danger/40" /> لا يوجد مصدر
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-warn/40" /> تحويل
          </span>
          <span>الفراغ في الخط = لا توجد قراءة</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { l: "الأدنى", v: stats?.min },
            { l: "المتوسط", v: stats?.avg },
            { l: "الأعلى", v: stats?.max },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-canvas py-2">
              <p className="text-[10px] text-muted">{s.l}</p>
              <p className="num text-[13px] font-bold text-ink" dir="ltr">
                {s.v === undefined ? "—" : fmtNum(s.v, mm.digits)}{" "}
                <span className="text-[10px] font-medium text-muted">{mm.unit}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-faint">
          الإحصائيات تشمل القراءات الصفرية أثناء الانقطاع.
        </p>
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
    <Card className="flex flex-col p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted">{label}</span>
        <Icon className="size-4" style={{ color }} />
      </div>
      <p
        className="num mt-2 text-[24px] leading-none font-bold text-ink"
        dir="ltr"
        style={{ textAlign: "right" }}
      >
        {value}
        <span className="ms-1 text-[12px] font-medium text-muted">{unit}</span>
      </p>
      {children && <div className="mt-2">{children}</div>}
    </Card>
  );
}
