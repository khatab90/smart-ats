import { ArrowLeft, CircleCheck, CircleX, Hand, History, ZapOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Chips, EmptyState, ErrorState, Skeleton, SourceIcon } from "../../components/ui";
import { SOURCE_META, transferReasonText } from "../../data/meta";
import type { EventRow, SourceId } from "../../data/types";
import { useEvents } from "../../hooks/data";
import { fmtClock, fmtDateTime, fmtDayLabel, fmtDuration, fmtMs, fmtTime } from "../../lib/format";
import { latestBefore } from "../../lib/timeline";
import { addDaysInTz, startOfDayInTz } from "../../lib/tz";
import { useActiveDevice, useNow } from "../../store/devices";
import { StatTile, num } from "./StatTile";

export const SWITCH_TYPES = [
  "transfer_completed",
  "transfer_failed",
  "no_source_started",
  "no_source_ended",
];

/** Restarts bound how long the previous source ran; they are not listed. */
const QUERY_TYPES = [...SWITCH_TYPES, "controller_restarted"];

export type Filter = "all" | "smart" | "manual" | "failed" | "no_source";

/** A real change from one source to another (not the end of a total outage). */
export function isSwitch(e: EventRow) {
  return (
    e.data.reason !== "source_restored" && e.from_source !== null && e.from_source !== e.to_source
  );
}

export function isManual(e: EventRow) {
  return e.data.mode === "manual" || e.data.reason === "manual";
}

export function SwitchLog() {
  const { device, status, settings, link, serverNow } = useActiveDevice();
  const tz = settings?.timezone ?? "UTC";
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Filter>("all");
  const now = useNow(1000);
  const since = useMemo(() => addDaysInTz(serverNow(), -(days - 1), tz), [days, tz, serverNow]);
  const { data, loading, error, reload } = useEvents(device?.id ?? null, QUERY_TYPES, since);
  const today = startOfDayInTz(serverNow(), tz);
  const weekStart = addDaysInTz(serverNow(), -6, tz);

  const completed = data.filter((e) => e.type === "transfer_completed");
  // Timing averages describe switching between sources; the end of a total
  // outage is not a switch (its length is shown on the outage entry).
  const week = completed.filter((e) => Date.parse(e.occurred_at) >= weekStart && isSwitch(e));
  const dead = week.map((e) => num(e.data.dead_ms)).filter((v): v is number => v !== null);
  const detect = week.map((e) => num(e.data.detect_ms)).filter((v): v is number => v !== null);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const failedWeek = data.filter(
    (e) => e.type === "transfer_failed" && Date.parse(e.occurred_at) >= weekStart,
  ).length;
  const todayCount = completed.filter((e) => Date.parse(e.occurred_at) >= today).length;

  const last = completed[0];
  const beforeLast = completed[1];
  // The previous source ran from the transfer before (or from the board's
  // last boot, if later) until the last transfer. Unknown otherwise.
  const prevRanMs = (() => {
    if (!last) return null;
    const at = Date.parse(last.occurred_at);
    const boots = data
      .filter((e) => e.type === "controller_restarted")
      .map((e) => Date.parse(e.occurred_at));
    const start = Math.max(
      beforeLast ? Date.parse(beforeLast.occurred_at) : -Infinity,
      latestBefore(boots, at) ?? -Infinity,
    );
    return Number.isFinite(start) ? at - start : null;
  })();
  const lastReason = last ? transferReasonText(last.data.reason) : null;
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
    if (e.type === "no_source_ended" || e.type === "controller_restarted") return false;
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
                    {SOURCE_META[current].short}
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
                    {SOURCE_META[last.from_source].short}
                  </p>
                  <p className="text-[11px] text-muted">
                    {prevRanMs !== null ? `عمل ${fmtDuration(prevRanMs)}` : "—"}
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
              آخر تحويل
              {lastReason && (
                <>
                  : <b className="text-ink">{lastReason}</b>
                </>
              )}
            </span>
            <span className="num shrink-0 text-muted">
              {Date.parse(last.occurred_at) >= today
                ? fmtTime(Date.parse(last.occurred_at), tz)
                : fmtDateTime(Date.parse(last.occurred_at), tz)}
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

export function SwitchRow({
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
  const reason = transferReasonText(e.data.reason) ?? (failed ? "سبب غير محدد" : null);
  const restored = !failed && !isSwitch(e);
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
          {restored
            ? dead !== null && (
                <>
                  {reason && " • "}مدة الانقطاع{" "}
                  <bdi className="whitespace-nowrap">{fmtDuration(dead)}</bdi>
                </>
              )
            : !failed &&
              (detect !== null || dead !== null) && (
                <>
                  {reason && " • "}كشف{" "}
                  <bdi className="whitespace-nowrap">{detect !== null ? fmtMs(detect) : "—"}</bdi> •
                  انقطاع{" "}
                  <bdi className="whitespace-nowrap">{dead !== null ? fmtMs(dead) : "—"}</bdi>
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
