import { ChartColumn, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { BarChart, Donut, type Bar } from "../components/charts";
import {
  NoDevice,
  PageHeading,
  WaitingForBoard,
  useAwaitingFirstData,
} from "../components/DeviceGate";
import { Card, EmptyState, ErrorState, SectionTitle, Segmented, Skeleton } from "../components/ui";
import { SOURCE_META, SOURCE_ORDER } from "../data/meta";
import type { SourceId } from "../data/types";
import { useEnergy, type EnergyRow } from "../hooks/data";
import { cn } from "../lib/cn";
import { fmtDate, fmtHour, fmtNum, fmtShortDay, fmtWeekday } from "../lib/format";
import { addDaysInTz, dayOfMonthInTz, startOfDayInTz } from "../lib/tz";
import { installedSources } from "../domain/sources";
import { useActiveDevice, useNow } from "../store/devices";
import { t, uiStart } from "../i18n";

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
        label: fmtHour(h),
        title: t("من {0} إلى {1}", { 0: fmtHour(h), 1: fmtHour(h + 1) }),
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
      title: `${fmtWeekday(from, tz)} ${fmtDate(from, tz)}`,
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

/** kWh with one decimal and its unit, kept left-to-right inside Arabic text. */
const kwhText = (v: number) => `\u2066${fmtNum(v, v >= 100 ? 0 : 1)} kWh\u2069`;

/**
 * The comparison with the previous period in plain words: "أكثر من أمس بـ
 * 3.2 kWh" and what the previous period used, instead of a percentage
 * (225% was hard to read).
 */
function comparison(range: Range, now: number, prev: number) {
  const diff = now - prev;
  const same = Math.abs(diff) < Math.max(0.1, prev * 0.05);
  const words = {
    day: {
      more: t("أكثر من أمس بـ {0}"),
      less: t("أقل من أمس بـ {0}"),
      same: t("مثل أمس تقريباً"),
      prev: t("أمس حتى نفس الساعة: {0}"),
    },
    week: {
      more: t("أكثر من الأسبوع السابق بـ {0}"),
      less: t("أقل من الأسبوع السابق بـ {0}"),
      same: t("مثل الأسبوع السابق تقريباً"),
      prev: t("الأسبوع السابق: {0}"),
    },
    month: {
      more: t("أكثر من الشهر السابق بـ {0}"),
      less: t("أقل من الشهر السابق بـ {0}"),
      same: t("مثل الشهر السابق تقريباً"),
      prev: t("الشهر السابق: {0}"),
    },
  }[range];
  return {
    tone: same ? ("same" as const) : diff > 0 ? ("up" as const) : ("down" as const),
    text: same
      ? words.same
      : (diff > 0 ? words.more : words.less).replace("{0}", kwhText(Math.abs(diff))),
    prev: words.prev.replace("{0}", kwhText(prev)),
  };
}

export function Energy() {
  const { device, settings, status, serverNow } = useActiveDevice();
  const awaiting = useAwaitingFirstData();
  const tz = settings?.timezone ?? "UTC";
  const [range, setRange] = useState<Range>("day");
  const [selected, setSelected] = useState<number | undefined>();
  const tick = useNow(60_000);
  const now = serverNow();

  const buckets = useMemo(() => buildBuckets(range, now, tz), [range, tz, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodStart = buckets[0]?.from ?? now;
  const span = (buckets[buckets.length - 1]?.to ?? now) - periodStart;
  // Fetch the previous comparable period too, for the comparison.
  const energy = useEnergy(device?.id ?? null, periodStart - span);

  const splits = buckets.map((b) => sumRange(energy.data, b.from, b.to));
  const totals = splits.reduce((acc, s) => {
    SOURCE_ORDER.forEach((k) => (acc[k] += s[k]));
    return acc;
  }, empty());
  const kwh = total(totals);
  const elapsed = Math.min(now, buckets[buckets.length - 1]?.to ?? now) - periodStart;
  const prev = total(sumRange(energy.data, periodStart - span, periodStart - span + elapsed));
  const hasPrev = energy.data.some((r) => Date.parse(r.hour_start) < periodStart);
  const cmp = hasPrev ? comparison(range, kwh, prev) : null;
  const hasData = energy.data.some((r) => Date.parse(r.hour_start) >= periodStart);
  // The current hour/day is the last bucket that has started.
  const currentIndex = Math.max(0, buckets.filter((b) => b.from <= now).length - 1);
  const bars: Bar[] = buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    value: total(splits[i]),
    future: b.from > now,
  }));
  const sel = selected !== undefined && selected <= currentIndex ? selected : currentIndex;
  // Sources shown: the installed ones, plus any that delivered energy in the period.
  const shown = SOURCE_ORDER.filter(
    (id) => installedSources(status).includes(id) || totals[id] > 0,
  );

  if (!device || awaiting) {
    return (
      <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
        <PageHeading title={t("الطاقة")} subtitle={t("كم استهلكت ومن أي مصدر")} />
        {device ? (
          <WaitingForBoard compact />
        ) : (
          <NoDevice icon={ChartColumn} body={t("أضف جهازاً لعرض إحصائيات الاستهلاك.")} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
      <PageHeading title={t("الطاقة")} subtitle={t("كم استهلكت ومن أي مصدر")} />

      <Segmented
        className="lg:max-w-md"
        value={range}
        onChange={(r) => {
          setRange(r);
          setSelected(undefined);
        }}
        options={[
          { value: "day", label: t("اليوم") },
          { value: "week", label: t("7 أيام") },
          { value: "month", label: t("30 يوماً") },
        ]}
      />

      {energy.error ? (
        <ErrorState message={energy.error} onRetry={energy.reload} />
      ) : energy.loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
      ) : !hasData ? (
        <Card className="pt-2">
          <EmptyState
            icon={ChartColumn}
            title={t("لا توجد بيانات حالياً")}
            body={t("تظهر الإحصائيات بعد أن يرسل البورد عدادات الطاقة لكل مصدر خلال هذه الفترة.")}
          />
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-muted">
              {range === "day"
                ? t("استهلاك اليوم حتى الآن")
                : range === "week"
                  ? t("استهلاك آخر 7 أيام")
                  : t("استهلاك آخر 30 يوماً")}
            </p>
            <p
              className="num mt-1 text-[32px] leading-tight font-bold text-ink"
              dir="ltr"
              style={{ textAlign: uiStart() }}
            >
              {fmtNum(kwh, kwh >= 100 ? 0 : 1)}{" "}
              <span className="text-[14px] font-medium text-muted">kWh</span>
            </p>
            {cmp ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                    cmp.tone === "up"
                      ? "bg-warn-soft text-warn-strong"
                      : cmp.tone === "down"
                        ? "bg-ok-soft text-ok-strong"
                        : "bg-canvas text-ink-2",
                  )}
                >
                  {cmp.tone === "up" ? (
                    <TrendingUp className="size-3.5" />
                  ) : cmp.tone === "down" ? (
                    <TrendingDown className="size-3.5" />
                  ) : (
                    <Minus className="size-3.5" />
                  )}
                  {cmp.text}
                </span>
                <span className="text-[12px] text-muted">{cmp.prev}</span>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-muted">
                {t("لا توجد بيانات للفترة السابقة للمقارنة")}
              </p>
            )}
          </Card>

          <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
            <Card className="p-4">
              <p className="text-[15px] font-bold text-ink">
                {range === "day" ? t("الاستهلاك في كل ساعة") : t("الاستهلاك في كل يوم")}
              </p>
              <p className="mb-5 text-[12px] text-muted">
                {t("بالكيلوواط ساعة (kWh) • اضغط على أي عمود لرؤية تفاصيله")}
              </p>
              <BarChart
                bars={bars}
                selected={sel}
                onSelect={setSelected}
                labelEvery={range === "day" ? 6 : range === "week" ? 1 : 7}
                unit="kWh"
                formatValue={(v) => fmtNum(v, v >= 10 ? 0 : 1)}
              />
              <div className="mt-4 rounded-2xl bg-canvas p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-ink">
                    {buckets[sel].title}
                    {sel === currentIndex && (
                      <span className="ms-1.5 text-[11px] font-medium text-muted">
                        {range === "day" ? t("(الساعة الحالية)") : t("(اليوم)")}
                      </span>
                    )}
                  </p>
                  <p className="num shrink-0 text-[14px] font-bold text-ink">
                    <bdi>{fmtNum(total(splits[sel]), 2)} kWh</bdi>
                  </p>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {shown.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] text-ink-2"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: SOURCE_META[id].color }}
                      />
                      {SOURCE_META[id].short}
                      <b className="num text-ink">
                        <bdi>{splits[sel][id] > 0 ? fmtNum(splits[sel][id], 2) : "0"}</bdi>
                      </b>
                    </span>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle title={t("من أين جاءت الكهرباء؟")} className="mb-4" />
              <div className="flex items-center gap-5">
                <Donut
                  segments={shown.map((id) => ({
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
                  {shown.map((id) => (
                    <div key={id}>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-1.5 font-semibold text-ink-2">
                          <span
                            className="size-2.5 rounded-full"
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
          </div>
        </>
      )}
    </div>
  );
}
