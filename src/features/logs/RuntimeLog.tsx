import { ChevronLeft, ChevronRight, History, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CommandProgress } from "../../components/control";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SectionTitle,
  Skeleton,
  SourceIcon,
} from "../../components/ui";
import { SOURCE_META } from "../../data/meta";
import type { SourceId } from "../../data/types";
import { lastEventBefore, useEvents } from "../../hooks/data";
import { useCommand } from "../../hooks/useCommand";
import {
  fmtClock,
  fmtDate,
  fmtDayLabel,
  fmtDuration,
  fmtFullDate,
  fmtHour,
  fmtHours,
  fmtNum,
  fmtShortDay,
  fmtTime,
  fmtWeekday,
} from "../../lib/format";
import {
  buildTimeline,
  durationsBy,
  stateAfter,
  TIMELINE_EVENT_TYPES,
  toTimelineEvent,
  type FeedState,
  type TimelineEvent,
} from "../../lib/timeline";
import { addDaysInTz, dayOfMonthInTz, startOfDayInTz } from "../../lib/tz";
import { cn } from "../../lib/cn";
import { installedSources } from "../../domain/sources";
import { useActiveDevice, useNow } from "../../store/devices";
import { t, uiStart } from "../../i18n";

/** The state before the window comes from the last state-changing event. */
const STATE_TYPES = [
  "transfer_started",
  "transfer_completed",
  "no_source_started",
  "no_source_ended",
  "controller_restarted",
];

const STATE_COLOR: Record<FeedState, string> = {
  grid: SOURCE_META.grid.color,
  solar: SOURCE_META.solar.color,
  generator: SOURCE_META.generator.color,
  none: "#e5372b",
  unknown: "var(--color-track)",
};

export function RuntimeLog() {
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
  const events = useEvents(device?.id ?? null, TIMELINE_EVENT_TYPES, windowStart);
  const [initial, setInitial] = useState<FeedState | null>(null);

  useEffect(() => {
    if (!device) return;
    let alive = true;
    setInitial(null);
    void lastEventBefore(device.id, STATE_TYPES, windowStart).then((e) => {
      if (alive) setInitial(stateAfter(e ? toTimelineEvent(e) : null));
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
      .map(toTimelineEvent);
    return buildTimeline(asc, initial, windowStart, Math.min(windowEnd, serverNow()));
  }, [events.data, initial, windowStart, windowEnd, serverNow]);

  const selIndex = days.indexOf(selectedDay);
  const selDay = selIndex >= 0 ? selectedDay : days[6];
  const selEnd = Math.min(addDaysInTz(selDay, 1, tz), serverNow());
  const selDur = durationsBy(timeline, selDay, selEnd);
  const activeSince = status?.active_since ? Date.parse(status.active_since) : null;
  const current = live && status?.system_state === "normal" ? status.active_source : null;
  const runtime = status?.runtime ?? null;
  const installed = installedSources(status);
  const canReset = isAdmin && link === "live" && !busy;

  return (
    <>
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <div className="space-y-4">
          <section className="hero-surface relative overflow-hidden rounded-[24px] p-5 text-white">
            <div className="hero-grid absolute inset-0" />
            <div className="relative flex items-center justify-between">
              <p className="flex items-center gap-2 text-[12px] text-white/60">
                <Timer className="size-4" /> {t("مدة تشغيل المصدر الحالي")}
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
              style={{ textAlign: uiStart() }}
            >
              {current && activeSince ? fmtClock(serverNow() - activeSince) : "--:--:--"}
            </p>
            <p className="relative mt-2 text-[12px] text-white/55">
              {!live
                ? t("غير متاح أثناء عدم اتصال البورد")
                : current && activeSince
                  ? t("بدأ {0} الساعة {1}", {
                      0: fmtDayLabel(activeSince, serverNow(), tz),
                      1: fmtTime(activeSince, tz),
                    })
                  : t("لا يوجد مصدر فعّال حالياً")}
            </p>
          </section>

          <Card className="p-4">
            <SectionTitle
              title={t("ساعات التشغيل التراكمية")}
              action={
                isAdmin && runtime ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={RotateCcw}
                    disabled={!canReset}
                    onClick={() => setConfirm([...installed])}
                  >
                    {t("تصفير الكل")}
                  </Button>
                ) : undefined
              }
            />
            {!runtime ? (
              <p className="py-4 text-center text-[13px] text-muted">
                {link === "never"
                  ? t("لا توجد بيانات حالياً.")
                  : t("لم يرسل البورد عدادات ساعات التشغيل بعد.")}
              </p>
            ) : (
              <div className="space-y-3">
                {installed.map((id) => {
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
                          {t("بدء العد:")}{" "}
                          {r?.since ? fmtFullDate(Date.parse(r.since), tz) : t("غير متوفر")}
                        </p>
                      </div>
                      <p className="num text-[15px] font-bold text-ink">
                        {r ? fmtHours(r.s) : "—"}{" "}
                        <span className="text-[11px] font-medium text-muted">{t("س")}</span>
                      </p>
                      {isAdmin && (
                        <button
                          type="button"
                          aria-label={t("تصفير ساعات {0}", { 0: SOURCE_META[id].name })}
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
              {t("تُحسب ساعات المصدر فقط عندما يكون هو الذي يغذي البيت.")}
            </p>
            {isAdmin && runtime && link !== "live" && (
              <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[12px] font-medium text-warn-strong">
                {t("التصفير متاح فقط أثناء اتصال البورد.")}
              </p>
            )}
          </Card>
        </div>
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-bold text-ink">{t("التشغيل اليومي")}</p>
              <p className="text-[12px] text-muted">{t("أي مصدر شغّل البيت وكم من الوقت")}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-label={t("الأسبوع السابق")}
                disabled={weekOffset >= 12}
                onClick={() => setWeekOffset((w) => w + 1)}
                className="flex size-9 items-center justify-center rounded-xl border border-line text-ink-2 disabled:opacity-30"
              >
                <ChevronRight className="size-4 ltr:rotate-180" />
              </button>
              <button
                type="button"
                aria-label={t("الأسبوع التالي")}
                disabled={weekOffset === 0}
                onClick={() => setWeekOffset((w) => w - 1)}
                className="flex size-9 items-center justify-center rounded-xl border border-line text-ink-2 disabled:opacity-30"
              >
                <ChevronLeft className="size-4 ltr:rotate-180" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const active = d === selDay;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "flex flex-col items-center rounded-xl py-2 transition",
                    active ? "bg-brand-800 text-white" : "bg-canvas text-ink-2 hover:bg-track",
                  )}
                >
                  <span className={cn("text-[10px]", active ? "text-white/70" : "text-muted")}>
                    {d === today ? t("اليوم") : fmtShortDay(d, tz)}
                  </span>
                  <span className="num text-[14px] font-bold">{dayOfMonthInTz(d, tz)}</span>
                </button>
              );
            })}
          </div>
          {events.error ? (
            <div className="mt-4">
              <ErrorState message={events.error} onRetry={events.reload} />
            </div>
          ) : events.loading || initial === null ? (
            <Skeleton className="mt-4 h-[220px]" />
          ) : events.data.length === 0 && initial === "unknown" ? (
            <EmptyState
              icon={History}
              title={t("لا توجد بيانات حالياً")}
              body={t("لا توجد أحداث تحويل مسجلة لهذه الفترة.")}
            />
          ) : (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-bold text-ink">
                  {fmtWeekday(selDay, tz)} {fmtDate(selDay, tz)}
                </p>
                <Badge tone="info">{selDay === today ? t("حتى الآن") : t("24 ساعة")}</Badge>
              </div>
              <DayStrip timeline={timeline} from={selDay} to={addDaysInTz(selDay, 1, tz)} />
              <div className="mt-4 space-y-3">
                {[
                  ...installed.map((id) => ({
                    key: id,
                    label: SOURCE_META[id].name,
                    color: SOURCE_META[id].color,
                    ms: selDur[id],
                  })),
                  {
                    key: "none",
                    label: t("بدون كهرباء"),
                    color: STATE_COLOR.none,
                    ms: selDur.none,
                  },
                ].map((r) => (
                  <div key={r.key}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2 font-semibold text-ink-2">
                        <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                        {r.label}
                      </span>
                      <span className="num font-bold text-ink">{fmtDuration(r.ms)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (r.ms / 86_400_000) * 100)}%`,
                          background: r.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {selDur.unknown > 60_000 && (
                <p className="mt-3 text-[11px] text-muted">
                  {fmtDuration(selDur.unknown)} {t("غير معروفة (قبل أول حدث مسجّل).")}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm && confirm.length > 1 ? t("تصفير جميع العدادات") : t("تصفير عداد المصدر")}
        confirmLabel={t("تأكيد التصفير")}
        icon={RotateCcw}
        danger
        onConfirm={() => {
          if (confirm) void send("reset_runtime", { sources: confirm });
          setConfirm(null);
        }}
      >
        {confirm && (
          <p className="text-[13px] leading-6 text-ink-2">
            {t("سيتم تصفير ساعات التشغيل في البورد لـ")}{" "}
            <b>{confirm.map((s) => SOURCE_META[s].name).join(t("، "))}</b>
            {t(
              "، ويبدأ العد من جديد بتاريخ اليوم. لا يمكن التراجع عن هذه العملية، وستُسجَّل باسمك في سجل الأحداث.",
            )}
          </p>
        )}
      </ConfirmDialog>
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
      <div className="relative h-8 overflow-hidden rounded-xl bg-track">
        {parts.map((p, i) => (
          <span
            key={i}
            className="absolute inset-y-0"
            style={{
              insetInlineStart: `${((p.a - from) / span) * 100}%`,
              width: `${((p.b - p.a) / span) * 100}%`,
              background: STATE_COLOR[p.state],
            }}
          />
        ))}
      </div>
      <div className="num mt-1.5 flex justify-between text-[11px] text-faint">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{fmtHour(h)}</span>
        ))}
      </div>
      <p className="sr-only">
        {fmtNum(parts.length)} {t("فترات")}
      </p>
    </div>
  );
}
