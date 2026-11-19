import { ChartColumn, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { BarChart, Donut, type Bar } from "../components/charts";
import {
  Card,
  EmptyState,
  ErrorState,
  InfoHint,
  SectionTitle,
  Segmented,
  Skeleton,
} from "../components/ui";
import { SOURCE_META, SOURCE_ORDER } from "../data/meta";
import type { SourceId } from "../data/types";
import { useEnergy, type EnergyRow } from "../hooks/data";
import { cn } from "../lib/cn";
import { fmtDate, fmtNum, fmtShortDay } from "../lib/format";
import { addDaysInTz, dayOfMonthInTz, startOfDayInTz } from "../lib/tz";
import { useActiveDevice, useNow } from "../store/devices";

type Range = "day" | "week" | "month";
type Split = Record<SourceId, number>;
const empty = (): Split => ({ grid: 0, solar: 0, generator: 0 });
const total = (s: Split) => s.grid + s.solar + s.generator;

interface Bucket {
  key: string;
  label: string;
  title: string;
  from: number;
  to: number;
}

function buildBuckets(range: Range, nowMs: number, tz: string): Bucket[] {
  const today = startOfDayInTz(nowMs, tz);
  if (range === "day") {
    return Array.from({ length: 24 }, (_, h) => {
      const from = today + h * 3_600_000;
      return {
        key: `h${h}`,
        label: String(h),
        title: `الساعة ${h}:00 – ${h + 1}:00`,
        from,
        to: from + 3_600_000,
      };
    });
  }
  const n = range === "week" ? 7 : 30;
  return Array.from({ length: n }, (_, i) => {
    const from = addDaysInTz(today, i - (n - 1), tz);
    const to = addDaysInTz(from, 1, tz);
    return {
      key: `d${from}`,
      label: range === "week" ? fmtShortDay(from, tz) : String(dayOfMonthInTz(from, tz)),
      title: `${fmtShortDay(from, tz)} ${fmtDate(from, tz)}`,
      from,
      to,
    };
  });
}

function sumRange(rows: EnergyRow[], from: number, to: number): Split {
  const out = empty();
  for (const r of rows) {
    const t = Date.parse(r.hour_start);
    if (t >= from && t < to) out[r.source] += r.wh / 1000;
  }
  return out;
}

export function Energy() {
  const { device, settings, serverNow } = useActiveDevice();
  const tz = settings?.timezone ?? "UTC";
  const [range, setRange] = useState<Range>("day");
  const [selected, setSelected] = useState<number | undefined>();
  const tick = useNow(60_000);
  const now = serverNow();

  const buckets = useMemo(() => buildBuckets(range, now, tz), [range, tz, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodStart = buckets[0]?.from ?? now;
  const span = (buckets[buckets.length - 1]?.to ?? now) - periodStart;
  // Fetch the previous comparable period too, for the trend.
  const energy = useEnergy(device?.id ?? null, periodStart - span);

  const splits = buckets.map((b) => sumRange(energy.data, b.from, b.to));
  const totals = splits.reduce((acc, s) => {
    SOURCE_ORDER.forEach((k) => (acc[k] += s[k]));
    return acc;
  }, empty());
  const kwh = total(totals);
  const elapsed = Math.min(now, buckets[buckets.length - 1]?.to ?? now) - periodStart;
  const prev = total(sumRange(energy.data, periodStart - span, periodStart - span + elapsed));
  const trend = prev > 0 ? ((kwh - prev) / prev) * 100 : null;
  const hasData = energy.data.some((r) => Date.parse(r.hour_start) >= periodStart);
  const bars: Bar[] = buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    segments: SOURCE_ORDER.map((id) => ({ value: splits[i][id], color: SOURCE_META[id].color })),
  }));
  const sel = selected !== undefined && selected < bars.length ? selected : undefined;

  if (!device) {
    return (
      <div className="px-5 pt-16">
        <EmptyState
          icon={ChartColumn}
          title="لا يوجد جهاز"
          body="أضف جهازاً لعرض إحصائيات الاستهلاك."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pt-4 pb-32">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">الطاقة</h1>
        <p className="text-[13px] text-muted">إحصائيات الاستهلاك التاريخية وتوزيعها على المصادر</p>
      </div>

      <Segmented
        value={range}
        onChange={(r) => {
          setRange(r);
          setSelected(undefined);
        }}
        options={[
          { value: "day", label: "اليوم" },
          { value: "week", label: "الأسبوع" },
          { value: "month", label: "الشهر" },
        ]}
      />

      {energy.error ? (
        <ErrorState message={energy.error} onRetry={energy.reload} />
      ) : energy.loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : !hasData ? (
        <Card className="pt-2">
          <EmptyState
            icon={ChartColumn}
            title="لا توجد بيانات حالياً"
            body="تظهر الإحصائيات بعد أن يرسل البورد عدادات الطاقة لكل مصدر خلال هذه الفترة."
          />
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <p className="flex items-center justify-between text-[12px] text-muted">
              إجمالي الاستهلاك
              <InfoHint text="مجموع عدادات الطاقة المرسلة من البورد لكل المصادر، مجمّعة كل ساعة على الخادم وبتوقيت الجهاز." />
            </p>
            <p className="num mt-1 text-[28px] leading-tight font-bold text-ink">
              {fmtNum(kwh, 1)} <span className="text-[13px] font-medium text-muted">kWh</span>
            </p>
            {trend !== null ? (
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-[12px] font-semibold",
                  trend > 0 ? "text-warn" : "text-ok",
                )}
              >
                {trend > 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                <span className="num">{fmtNum(Math.abs(trend), 0)}%</span>
                {range === "day"
                  ? "مقارنة بنفس الفترة أمس"
                  : range === "week"
                    ? "مقارنة بالأسبوع السابق"
                    : "مقارنة بالثلاثين يوماً السابقة"}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-muted">لا توجد بيانات للفترة السابقة للمقارنة</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-bold text-ink">
                  الاستهلاك حسب {range === "day" ? "الساعة" : "اليوم"}
                </p>
                {sel !== undefined ? (
                  <p className="text-[12px] text-muted">
                    {buckets[sel].title} •{" "}
                    <span className="num font-semibold text-ink">
                      {fmtNum(total(splits[sel]), 2)} kWh
                    </span>
                  </p>
                ) : (
                  <p className="text-[12px] text-muted">اضغط على عمود لعرض التفاصيل (kWh)</p>
                )}
              </div>
              {sel !== undefined && (
                <button
                  type="button"
                  onClick={() => setSelected(undefined)}
                  className="text-[12px] font-semibold text-brand-600"
                >
                  مسح
                </button>
              )}
            </div>
            <BarChart
              bars={bars}
              selected={sel}
              onSelect={(i) => setSelected(i === sel ? undefined : i)}
              labelEvery={range === "day" ? 4 : range === "week" ? 1 : 5}
              unit="kWh"
            />
            {sel !== undefined ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {SOURCE_ORDER.map((id) => (
                  <div
                    key={id}
                    className="rounded-xl px-2.5 py-2"
                    style={{ background: SOURCE_META[id].soft }}
                  >
                    <p
                      className="text-[10px] font-semibold"
                      style={{ color: SOURCE_META[id].color }}
                    >
                      {SOURCE_META[id].short}
                    </p>
                    <p className="num text-[13px] font-bold text-ink">
                      {fmtNum(splits[sel][id], 2)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex justify-center gap-4">
                {SOURCE_ORDER.map((id) => (
                  <span key={id} className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ background: SOURCE_META[id].color }}
                    />
                    {SOURCE_META[id].short}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle title="توزيع الاستهلاك على المصادر" className="mb-4" />
            <div className="flex items-center gap-5">
              <Donut
                segments={SOURCE_ORDER.map((id) => ({
                  value: totals[id],
                  color: SOURCE_META[id].color,
                }))}
              >
                <p className="num text-[20px] leading-none font-bold text-ink">
                  {fmtNum(kwh, kwh < 100 ? 1 : 0)}
                </p>
                <p className="mt-1 text-[10px] text-muted">kWh</p>
              </Donut>
              <div className="min-w-0 flex-1 space-y-3">
                {SOURCE_ORDER.map((id) => (
                  <div key={id}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1.5 font-semibold text-ink-2">
                        <span
                          className="size-2.5 rounded-[3px]"
                          style={{ background: SOURCE_META[id].color }}
                        />
                        {SOURCE_META[id].short}
                      </span>
                      <span className="num font-bold text-ink">
                        {kwh > 0 ? fmtNum((totals[id] / kwh) * 100) : 0}%
                      </span>
                    </div>
                    <p className="num mt-0.5 text-[11px] text-muted">
                      <bdi>{fmtNum(totals[id], 1)} kWh</bdi>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
