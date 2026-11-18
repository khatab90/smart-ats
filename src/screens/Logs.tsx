import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Hand,
  History,
  RotateCcw,
  Timer,
  ZapOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BarChart, type Bar } from "../components/charts";
import { CommandProgress } from "../components/control";
import {
  Badge,
  Button,
  Card,
  Chips,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  InfoHint,
  SectionTitle,
  Segmented,
  Skeleton,
  SourceIcon,
} from "../components/ui";
import { SOURCE_META, SOURCE_ORDER, TRANSFER_REASON } from "../data/meta";
import type { EventRow, SourceId } from "../data/types";
import { lastEventBefore, useEvents } from "../hooks/data";
import { useCommand } from "../hooks/useCommand";
import { cn } from "../lib/cn";
import {
  fmtClock,
  fmtDate,
  fmtDayLabel,
  fmtDuration,
  fmtFullDate,
  fmtHours,
  fmtMs,
  fmtNum,
  fmtShortDay,
  fmtTime,
  fmtWeekday,
} from "../lib/format";
import {
  buildTimeline,
  durationsBy,
  stateAfter,
  type FeedState,
  type TimelineEvent,
} from "../lib/timeline";
import { addDaysInTz, startOfDayInTz } from "../lib/tz";
import { useActiveDevice, useNow } from "../store/devices";
import { useNav } from "../store/nav";

const DAY = 86_400_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function Logs() {
  const { view } = useNav();
  const { device } = useActiveDevice();
  const [tab, setTab] = useState<"switch" | "runtime">(view === "runtime" ? "runtime" : "switch");
  if (!device) {
    return (
      <div className="px-5 pt-16">
        <EmptyState icon={History} title="لا يوجد جهاز" body="أضف جهازاً لعرض السجل." />
      </div>
    );
  }
  return (
    <div className="space-y-4 px-5 pt-4 pb-32">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">السجل</h1>
        <p className="text-[13px] text-muted">عمليات التحويل وساعات تشغيل المصادر</p>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "switch", label: "التحويلات" },
          { value: "runtime", label: "ساعات التشغيل" },
        ]}
      />
      {tab === "switch" ? <SwitchLog /> : <RuntimeLog />}
    </div>
  );
}

const SWITCH_TYPES = [
  "transfer_completed",
  "transfer_failed",
  "no_source_started",
  "no_source_ended",
];
type Filter = "all" | "smart" | "manual" | "failed" | "no_source";

function isManual(e: EventRow) {
  return e.data.mode === "manual" || e.data.reason === "manual";
}

function SwitchLog() {
  const { device, status, settings, link, serverNow } = useActiveDevice();
  const tz = settings?.timezone ?? "UTC";
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Filter>("all");
  const now = useNow(1000);
  const since = useMemo(() => addDaysInTz(serverNow(), -(days - 1), tz), [days, tz, serverNow]);
  const { data, loading, error, reload } = useEvents(device?.id ?? null, SWITCH_TYPES, since);
  const today = startOfDayInTz(serverNow(), tz);
  const weekStart = addDaysInTz(serverNow(), -6, tz);

  const completed = data.filter((e) => e.type === "transfer_completed");
  const week = completed.filter((e) => Date.parse(e.occurred_at) >= weekStart);
  const dead = week.map((e) => num(e.data.dead_ms)).filter((v): v is number => v !== null);
  const detect = week.map((e) => num(e.data.detect_ms)).filter((v): v is number => v !== null);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const failedWeek = data.filter(
    (e) => e.type === "transfer_failed" && Date.parse(e.occurred_at) >= weekStart,
  ).length;
  const todayCount = completed.filter((e) => Date.parse(e.occurred_at) >= today).length;

  const last = completed[0];
  const beforeLast = completed[1];
  const live = link === "live" || link === "stale";
  const current: SourceId | null = live
    ? status?.system_state === "no_source"
      ? null
      : (status?.active_source ?? null)
    : (last?.to_source ?? null);
  const activeSince = status?.active_since ? Date.parse(status.active_since) : null;

  // Pair each total-loss start with its end for the duration.
  const noSourceEnd = useMemo(() => {
    const asc = [...data].reverse();
    const map = new Map<number, number | null>();
    asc.forEach((e, i) => {
      if (e.type !== "no_source_started") return;
      const end = asc.slice(i + 1).find((x) => x.type === "no_source_ended");
      map.set(e.id, end ? Date.parse(end.occurred_at) : null);
    });
    return map;
  }, [data]);

  const filtered = data.filter((e) => {
    if (e.type === "no_source_ended") return false;
    if (filter === "smart") return e.type === "transfer_completed" && !isManual(e);
    if (filter === "manual") return e.type === "transfer_completed" && isManual(e);
    if (filter === "failed") return e.type === "transfer_failed";
    if (filter === "no_source") return e.type === "no_source_started";
    return true;
  });
  const groups = useMemo(() => {
    const m = new Map<number, EventRow[]>();
    for (const e of filtered) {
      const d = startOfDayInTz(Date.parse(e.occurred_at), tz);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return [...m.entries()];
  }, [filtered, tz]);

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <Card className="p-4">
        <div className="flex items-stretch gap-3">
          <div className="min-w-0 flex-1 rounded-2xl bg-ok-soft/60 p-3">
            <p className="text-[11px] font-semibold text-ok-strong">
              {live ? "المصدر الحالي" : "آخر مصدر معروف"}
            </p>
            {current ? (
              <div className="mt-2 flex items-center gap-2">
                <SourceIcon source={current} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {SOURCE_META[current].name}
                  </p>
                  <p
                    className="num text-[11px] text-muted"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {live && activeSince ? fmtClock(serverNow() - activeSince) : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[13px] font-bold text-ink">
                {live && status?.system_state === "no_source" ? "لا يوجد مصدر" : "—"}
              </p>
            )}
          </div>
          <div className="flex items-center text-faint">
            <ArrowLeft className="size-4 rotate-180" />
          </div>
          <div className="min-w-0 flex-1 rounded-2xl bg-canvas p-3">
            <p className="text-[11px] font-semibold text-muted">المصدر السابق</p>
            {last?.from_source ? (
              <div className="mt-2 flex items-center gap-2">
                <SourceIcon source={last.from_source} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {SOURCE_META[last.from_source].name}
                  </p>
                  <p className="text-[11px] text-muted">
                    {beforeLast
                      ? `عمل ${fmtDuration(Date.parse(last.occurred_at) - Date.parse(beforeLast.occurred_at))}`
                      : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-muted">—</p>
            )}
          </div>
        </div>
        {last && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-[12px]">
            <span className="truncate text-muted">
              آخر تحويل:{" "}
              <b className="text-ink">{TRANSFER_REASON[String(last.data.reason ?? "")] ?? "—"}</b>
            </span>
            <span className="num shrink-0 text-muted">
              {fmtTime(Date.parse(last.occurred_at), tz)}
            </span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="تحويلات اليوم"
          value={loading ? null : String(todayCount)}
          hint="عدد التحويلات الناجحة منذ منتصف الليل بتوقيت الجهاز. المحاولات الفاشلة لا تُحتسب هنا."
        />
        <StatTile
          label="محاولات فاشلة (7 أيام)"
          value={loading ? null : String(failedWeek)}
          tone={failedWeek ? "danger" : undefined}
          hint="عدد مرات تعذّر فيها الانتقال إلى المصدر البديل خلال آخر 7 أيام."
        />
        <StatTile
          label="متوسط زمن الانقطاع"
          value={loading ? null : avg(dead) === null ? "—" : fmtMs(avg(dead)!)}
          hint="متوسط المدة الفعلية بين فصل المصدر القديم وتوصيل الجديد كما قاسها البورد، لكل المصادر بما فيها المولد، خلال آخر 7 أيام."
        />
        <StatTile
          label="متوسط زمن الكشف"
          value={loading ? null : avg(detect) === null ? "—" : fmtMs(avg(detect)!)}
          hint="متوسط المدة بين خروج المصدر عن الحدود وبدء التحويل كما قاسها البورد، خلال آخر 7 أيام."
        />
      </div>

      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "الكل" },
          { value: "smart", label: "الوضع الذكي" },
          { value: "manual", label: "يدوي" },
          {
            value: "failed",
            label: "فاشلة",
            count: data.filter((e) => e.type === "transfer_failed").length,
          },
          { value: "no_source", label: "انقطاع كلي" },
        ]}
      />

      {loading ? (
        <Skeleton className="h-48" />
      ) : groups.length === 0 ? (
        <Card className="pt-2">
          <EmptyState
            icon={History}
            title="لا توجد بيانات حالياً"
            body={`لم يسجّل البورد أي عملية مطابقة خلال آخر ${days} أيام.`}
          />
        </Card>
      ) : (
        groups.map(([day, events]) => (
          <div key={day}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-bold text-ink">{fmtDayLabel(day, now, tz)}</p>
              <span className="text-[11px] text-muted">{events.length} سجل</span>
            </div>
            <Card className="divide-y divide-line">
              {events.map((e) => (
                <SwitchRow key={e.id} e={e} tz={tz} noSourceEnd={noSourceEnd.get(e.id)} />
              ))}
            </Card>
          </div>
        ))
      )}

      {!loading && (
        <button
          type="button"
          onClick={() => setDays((d) => d + 7)}
          className="w-full rounded-2xl border border-dashed border-line py-3 text-[13px] font-semibold text-brand-600 hover:border-brand-200"
        >
          عرض أيام أقدم
        </button>
      )}
    </>
  );
}

function SwitchRow({
  e,
  tz,
  noSourceEnd,
}: {
  e: EventRow;
  tz: string;
  noSourceEnd: number | null | undefined;
}) {
  const at = Date.parse(e.occurred_at);
  if (e.type === "no_source_started") {
    return (
      <div className="flex items-center gap-3 bg-danger-soft/40 p-3.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <ZapOff className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-danger-strong">
            انقطاع كلي — لا يوجد مصدر متاح
          </p>
          <p className="text-[11px] text-muted">
            {noSourceEnd
              ? `المدة ${fmtDuration(noSourceEnd - at)} • انتهى ${fmtTime(noSourceEnd, tz)}`
              : "مستمر أو لم يصل حدث انتهائه بعد"}
          </p>
        </div>
        <p className="num text-[12px] font-semibold text-ink-2">{fmtTime(at, tz)}</p>
      </div>
    );
  }
  const failed = e.type === "transfer_failed";
  const detect = num(e.data.detect_ms);
  const dead = num(e.data.dead_ms);
  const reason =
    TRANSFER_REASON[String(e.data.reason ?? "")] ??
    (failed ? String(e.data.reason ?? "سبب غير محدد") : "—");
  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex items-center">
        {e.from_source ? (
          <SourceIcon source={e.from_source} size="sm" muted />
        ) : (
          <span className="size-8" />
        )}
        <ArrowLeft className="mx-0.5 size-3.5 text-faint" />
        {e.to_source ? (
          <SourceIcon source={e.to_source} size="sm" muted={failed} />
        ) : (
          <span className="size-8" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink">
          {isManual(e) && <Hand className="size-3.5 shrink-0 text-brand-500" />}
          {failed
            ? `فشل التحويل إلى ${e.to_source ? SOURCE_META[e.to_source].short : "المصدر البديل"}`
            : `إلى ${e.to_source ? SOURCE_META[e.to_source].name : "—"}`}
        </p>
        <p className="text-[11px] leading-5 text-muted">
          {reason}
          {!failed && (detect !== null || dead !== null) && (
            <>
              {" • "}كشف <bdi>{detect !== null ? fmtMs(detect) : "—"}</bdi> • انقطاع{" "}
              <bdi>{dead !== null ? fmtMs(dead) : "—"}</bdi>
            </>
          )}
        </p>
      </div>
      <div className="text-left">
        <p className="num text-[12px] font-semibold text-ink-2">{fmtTime(at, tz)}</p>
        {failed ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-danger">
            <CircleX className="size-3" /> فشل
          </span>
        ) : (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-ok">
            <CircleCheck className="size-3" /> ناجح
          </span>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | null;
  hint: string;
  tone?: "danger";
}) {
  return (
    <Card className="p-3">
      <p className="flex items-center justify-between gap-1 text-[11px] text-muted">
        <span className="truncate">{label}</span>
        <InfoHint text={hint} />
      </p>
      {value === null ? (
        <Skeleton className="mt-2 h-6 w-14" />
      ) : (
        <p
          className={cn(
            "num mt-1 text-[18px] font-bold",
            tone === "danger" ? "text-danger" : "text-ink",
          )}
          dir="ltr"
          style={{ textAlign: "right" }}
        >
          {value}
        </p>
      )}
    </Card>
  );
}

const TIMELINE_TYPES = [
  "transfer_started",
  "transfer_completed",
  "no_source_started",
  "no_source_ended",
];
const STATE_COLOR: Record<FeedState, string> = {
  grid: SOURCE_META.grid.color,
  solar: SOURCE_META.solar.color,
  generator: SOURCE_META.generator.color,
  none: "#e5372b",
  unknown: "#e9eef6",
};

function RuntimeLog() {
  const { device, status, settings, link, isAdmin, serverNow } = useActiveDevice();
  const tz = settings?.timezone ?? "UTC";
  useNow(1000);
  const live = link === "live" || link === "stale";
  const { state: cmd, send, reset, busy } = useCommand();
  const [confirm, setConfirm] = useState<SourceId[] | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const today = startOfDayInTz(serverNow(), tz);
  const days = Array.from({ length: 7 }, (_, i) => addDaysInTz(today, i - 6 - weekOffset * 7, tz));
  const windowStart = days[0];
  const windowEnd = addDaysInTz(days[6], 1, tz);
  const [selectedDay, setSelectedDay] = useState(today);
  const events = useEvents(device?.id ?? null, TIMELINE_TYPES, windowStart);
  const [initial, setInitial] = useState<FeedState | null>(null);

  useEffect(() => {
    if (!device) return;
    let alive = true;
    setInitial(null);
    void lastEventBefore(device.id, TIMELINE_TYPES, windowStart).then((e) => {
      if (alive) setInitial(stateAfter(e ? { t: 0, type: e.type, to: e.to_source } : null));
    });
    return () => {
      alive = false;
    };
  }, [device, windowStart]);

  const timeline = useMemo(() => {
    if (initial === null) return [];
    const asc: TimelineEvent[] = [...events.data]
      .reverse()
      .filter((e) => Date.parse(e.occurred_at) < windowEnd)
      .map((e) => ({ t: Date.parse(e.occurred_at), type: e.type, to: e.to_source }));
    return buildTimeline(asc, initial, windowStart, Math.min(windowEnd, serverNow()));
  }, [events.data, initial, windowStart, windowEnd, serverNow]);

  const bars: Bar[] = days.map((d) => {
    const dur = durationsBy(timeline, d, addDaysInTz(d, 1, tz));
    return {
      key: String(d),
      label: fmtShortDay(d, tz),
      segments: SOURCE_ORDER.map((id) => ({
        value: dur[id] / 3_600_000,
        color: SOURCE_META[id].color,
      })),
    };
  });
  const selIndex = days.indexOf(selectedDay);
  const selDay = selIndex >= 0 ? selectedDay : days[6];
  const selEnd = Math.min(addDaysInTz(selDay, 1, tz), serverNow());
  const selDur = durationsBy(timeline, selDay, selEnd);
  const activeSince = status?.active_since ? Date.parse(status.active_since) : null;
  const current = live && status?.system_state === "normal" ? status.active_source : null;
  const runtime = status?.runtime ?? null;
  const canReset = isAdmin && link === "live" && !busy;

  return (
    <>
      <section className="hero-surface relative overflow-hidden rounded-[24px] p-5 text-white">
        <div className="hero-grid absolute inset-0" />
        <div className="relative flex items-center justify-between">
          <p className="flex items-center gap-2 text-[12px] text-white/60">
            <Timer className="size-4" /> مدة تشغيل المصدر الحالي
          </p>
          {current && (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: `${SOURCE_META[current].color}33` }}
            >
              {SOURCE_META[current].name}
            </span>
          )}
        </div>
        <p
          className="num relative mt-3 text-[40px] leading-none font-bold tracking-tight"
          dir="ltr"
          style={{ textAlign: "right" }}
        >
          {current && activeSince ? fmtClock(serverNow() - activeSince) : "--:--:--"}
        </p>
        <p className="relative mt-2 text-[12px] text-white/55">
          {!live
            ? "غير متاح أثناء عدم اتصال البورد"
            : current && activeSince
              ? `بدأ ${fmtDayLabel(activeSince, serverNow(), tz)} الساعة ${fmtTime(activeSince, tz)}`
              : "لا يوجد مصدر فعّال حالياً"}
        </p>
      </section>

      <Card className="p-4">
        <SectionTitle
          title="ساعات التشغيل التراكمية"
          action={
            isAdmin && runtime ? (
              <Button
                size="sm"
                variant="secondary"
                icon={RotateCcw}
                disabled={!canReset}
                onClick={() => setConfirm([...SOURCE_ORDER])}
              >
                تصفير الكل
              </Button>
            ) : undefined
          }
        />
        {!runtime ? (
          <p className="py-4 text-center text-[13px] text-muted">
            {link === "never" ? "لا توجد بيانات حالياً." : "لم يرسل البورد عدادات ساعات التشغيل بعد."}
          </p>
        ) : (
          <div className="space-y-3">
            {SOURCE_ORDER.map((id) => {
              const r = runtime[id];
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-2xl border border-line p-3"
                >
                  <SourceIcon source={id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">{SOURCE_META[id].name}</p>
                    <p className="text-[11px] text-muted">
                      بدء العد: {r?.since ? fmtFullDate(Date.parse(r.since), tz) : "غير متوفر"}
                    </p>
                  </div>
                  <p className="num text-[15px] font-bold text-ink">
                    {r ? fmtHours(r.s) : "—"}{" "}
                    <span className="text-[11px] font-medium text-muted">س</span>
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      aria-label={`تصفير ساعات ${SOURCE_META[id].name}`}
                      disabled={!canReset}
                      onClick={() => setConfirm([id])}
                      className="rounded-xl p-2 text-muted hover:bg-canvas hover:text-danger disabled:opacity-30"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <CommandProgress state={cmd} onDismiss={reset} />
        <p className="mt-3 text-[11px] leading-5 text-muted">
          تُحسب الساعات في ذاكرة البورد فقط عندما يكون المصدر هو المصدر الفعّال الذي يغذي الحمل. وقت
          التحويل والانقطاع الكلي لا يُحتسب لأي مصدر.
          {isAdmin && link !== "live" ? " التصفير متاح فقط أثناء اتصال البورد." : ""}
        </p>
      </Card>

      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-bold text-ink">سجل التشغيل اليومي</p>
            <p className="num text-[12px] text-muted">
              {fmtDate(days[0], tz)} – {fmtDate(days[6], tz)}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="الأسبوع السابق"
              disabled={weekOffset >= 12}
              onClick={() => setWeekOffset((w) => w + 1)}
              className="flex size-9 items-center justify-center rounded-xl border border-line text-ink-2 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              aria-label="الأسبوع التالي"
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset((w) => w - 1)}
              className="flex size-9 items-center justify-center rounded-xl border border-line text-ink-2 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
        </div>
        {events.error ? (
          <ErrorState message={events.error} onRetry={events.reload} />
        ) : events.loading || initial === null ? (
          <Skeleton className="h-[170px]" />
        ) : events.data.length === 0 && initial === "unknown" ? (
          <EmptyState
            icon={History}
            title="لا توجد بيانات حالياً"
            body="لا توجد أحداث تحويل مسجلة لهذه الفترة."
          />
        ) : (
          <>
            <BarChart
              bars={bars}
              height={140}
              maxValue={24}
              selected={selIndex >= 0 ? selIndex : undefined}
              onSelect={(i) => setSelectedDay(days[i])}
              unit="ساعة"
            />
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-bold text-ink">
                  {fmtWeekday(selDay, tz)} {fmtDate(selDay, tz)}
                </p>
                <Badge tone="info">{selDay === today ? "حتى الآن" : "24 ساعة"}</Badge>
              </div>
              <DayStrip timeline={timeline} from={selDay} to={addDaysInTz(selDay, 1, tz)} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {SOURCE_ORDER.map((id) => (
                  <div
                    key={id}
                    className="rounded-2xl p-3"
                    style={{ background: SOURCE_META[id].soft }}
                  >
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: SOURCE_META[id].color }}
                    >
                      {SOURCE_META[id].short}
                    </p>
                    <p className="num mt-1 text-[14px] font-bold text-ink">
                      {fmtDuration(selDur[id])}
                    </p>
                  </div>
                ))}
                <div className="rounded-2xl bg-danger-soft p-3">
                  <p className="text-[11px] font-semibold text-danger">بلا مصدر / تحويل</p>
                  <p className="num mt-1 text-[14px] font-bold text-ink">
                    {fmtDuration(selDur.none)}
                  </p>
                </div>
              </div>
              {selDur.unknown > 60_000 && (
                <p className="mt-2 text-[11px] text-muted">
                  {fmtDuration(selDur.unknown)} غير معروفة (قبل أول حدث مسجّل).
                </p>
              )}
              <p className="mt-2 text-[10px] text-faint">
                محسوب من سجل أحداث التحويل. العدادات التراكمية أعلاه من ذاكرة البورد.
              </p>
            </div>
          </>
        )}
      </Card>

      <ConfirmSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm && confirm.length > 1 ? "تصفير جميع العدادات" : "تصفير عداد المصدر"}
        confirmLabel="تأكيد التصفير"
        danger
        onConfirm={() => {
          if (confirm) void send("reset_runtime", { sources: confirm });
          setConfirm(null);
        }}
      >
        {confirm && (
          <p className="text-[13px] leading-6 text-ink-2">
            سيتم تصفير ساعات التشغيل في البورد لـ{" "}
            <b>{confirm.map((s) => SOURCE_META[s].name).join("، ")}</b>، ويبدأ العد من جديد بتاريخ
            اليوم. لا يمكن التراجع عن هذه العملية، وستُسجَّل باسمك في سجل الأحداث.
          </p>
        )}
      </ConfirmSheet>
    </>
  );
}

function DayStrip({
  timeline,
  from,
  to,
}: {
  timeline: ReturnType<typeof buildTimeline>;
  from: number;
  to: number;
}) {
  const span = to - from;
  const parts = timeline
    .map((s) => ({ ...s, a: Math.max(s.start, from), b: Math.min(s.end, to) }))
    .filter((s) => s.b > s.a && s.state !== "unknown");
  return (
    <div className="mt-3">
      <div className="relative h-7 overflow-hidden rounded-lg bg-[#e9eef6]">
        {parts.map((p, i) => (
          <span
            key={i}
            className="absolute inset-y-0"
            style={{
              right: `${((p.a - from) / span) * 100}%`,
              width: `${((p.b - p.a) / span) * 100}%`,
              background: STATE_COLOR[p.state],
            }}
          />
        ))}
      </div>
      <div className="num mt-1.5 flex justify-between text-[10px] text-faint">
        {["00", "06", "12", "18", "24"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <p className="sr-only">{fmtNum(parts.length)} فترات</p>
    </div>
  );
}
