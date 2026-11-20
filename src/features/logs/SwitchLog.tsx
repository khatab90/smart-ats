import { ArrowLeft, CircleCheck, CircleX, Hand, History, ZapOff } from "lucide-react";
import { useMemo } from "react";
import { Badge, Card, ErrorState, Row, RowGroup, SourceIcon } from "../../components/ui";
import { useNav } from "../../store/nav";
import { SOURCE_META, transferReasonText } from "../../data/meta";
import type { EventRow, SourceId } from "../../data/types";
import { useEvents } from "../../hooks/data";
import { arCount, fmtClock, fmtDateTime, fmtDuration, fmtMs, fmtTime } from "../../lib/format";
import { latestBefore } from "../../lib/timeline";
import { addDaysInTz, startOfDayInTz } from "../../lib/tz";
import { useActiveDevice, useNow } from "../../store/devices";
import { StatTile, num } from "./StatTile";
import { t, uiStart } from "../../i18n";

const SWITCH_TYPES = [
  "transfer_completed",
  "transfer_failed",
  "no_source_started",
  "no_source_ended",
];

/** Restarts bound how long the previous source ran; they are not listed. */
export const QUERY_TYPES = [...SWITCH_TYPES, "controller_restarted"];

export type Filter = "all" | "smart" | "manual" | "failed" | "no_source";

/** Events shown as entries in the log (an outage end is part of its start). */
export function isListed(e: EventRow) {
  return e.type !== "no_source_ended" && e.type !== "controller_restarted";
}

const ENTRY_COUNT = {
  one: t("سجل واحد"),
  two: t("سجلان"),
  few: t("سجلات"),
  many: t("سجلاً"),
  base: t("سجل"),
};

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
  const { push } = useNav();
  useNow(1000);
  const since = useMemo(() => addDaysInTz(serverNow(), -6, tz), [tz, serverNow]);
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
  const listed = arCount(data.filter(isListed).length, ENTRY_COUNT);

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

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <Card className="p-4">
          <div className="flex items-stretch gap-3">
            <div className="min-w-0 flex-1 rounded-2xl bg-ok-soft/60 p-3">
              <p className="text-[11px] font-semibold text-ok-strong">
                {live ? t("المصدر الحالي") : t("آخر مصدر معروف")}
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
                      style={{ textAlign: uiStart() }}
                    >
                      {live && activeSince ? fmtClock(serverNow() - activeSince) : "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[13px] font-bold text-ink">
                  {live && status?.system_state === "no_source" ? t("لا يوجد مصدر") : "—"}
                </p>
              )}
            </div>
            <div className="flex items-center text-faint">
              <ArrowLeft className="size-4 rtl:rotate-180" />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl bg-canvas p-3">
              <p className="text-[11px] font-semibold text-muted">{t("المصدر السابق")}</p>
              {last?.from_source ? (
                <div className="mt-2 flex items-center gap-2">
                  <SourceIcon source={last.from_source} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-ink">
                      {SOURCE_META[last.from_source].short}
                    </p>
                    <p className="text-[11px] text-muted">
                      {prevRanMs !== null ? t("عمل {0}", { 0: fmtDuration(prevRanMs) }) : "—"}
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
                {t("آخر تحويل")}
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
            label={t("تحويلات اليوم")}
            value={loading ? null : String(todayCount)}
            hint={t(
              "عدد التحويلات الناجحة منذ منتصف الليل بتوقيت الجهاز. المحاولات الفاشلة لا تُحتسب هنا.",
            )}
          />
          <StatTile
            label={t("محاولات فاشلة (7 أيام)")}
            value={loading ? null : String(failedWeek)}
            tone={failedWeek ? "danger" : undefined}
            hint={t("عدد مرات تعذّر فيها الانتقال إلى المصدر البديل خلال آخر 7 أيام.")}
          />
          <StatTile
            label={t("متوسط زمن الانقطاع")}
            value={loading ? null : avg(dead) === null ? "—" : fmtMs(avg(dead)!)}
            hint={t(
              "متوسط المدة الفعلية بين فصل المصدر القديم وتوصيل الجديد كما قاسها البورد، لكل المصادر بما فيها المولد، خلال آخر 7 أيام.",
            )}
          />
          <StatTile
            label={t("متوسط زمن الكشف")}
            value={loading ? null : avg(detect) === null ? "—" : fmtMs(avg(detect)!)}
            hint={t(
              "متوسط المدة بين خروج المصدر عن الحدود وبدء التحويل كما قاسها البورد، خلال آخر 7 أيام.",
            )}
          />
        </div>
      </div>
      <RowGroup>
        <Row
          icon={History}
          title={t("سجل التحويلات")}
          subtitle={loading ? t("جارٍ التحميل…") : t("{0} خلال آخر 7 أيام", { 0: listed })}
          right={
            failedWeek ? (
              <Badge tone="danger">{t("{0} فاشلة", { 0: failedWeek })}</Badge>
            ) : undefined
          }
          onClick={() => push("transfers")}
        />
      </RowGroup>
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
            {t("انقطاع كلي — لا يوجد مصدر متاح")}
          </p>
          <p className="text-[11px] text-muted">
            {noSourceEnd
              ? t("المدة {0} • انتهى {1}", {
                  0: fmtDuration(noSourceEnd - at),
                  1: fmtTime(noSourceEnd, tz),
                })
              : t("مستمر أو لم يصل حدث انتهائه بعد")}
          </p>
        </div>
        <p className="num text-[12px] font-semibold text-ink-2">{fmtTime(at, tz)}</p>
      </div>
    );
  }
  const failed = e.type === "transfer_failed";
  const detect = num(e.data.detect_ms);
  const dead = num(e.data.dead_ms);
  const reason = transferReasonText(e.data.reason) ?? (failed ? t("سبب غير محدد") : null);
  const restored = !failed && !isSwitch(e);
  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex items-center">
        {e.from_source ? (
          <SourceIcon source={e.from_source} size="sm" muted />
        ) : (
          <span className="size-8" />
        )}
        <ArrowLeft className="mx-0.5 size-3.5 text-faint ltr:rotate-180" />
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
            ? t("فشل التحويل إلى {0}", {
                0: e.to_source ? SOURCE_META[e.to_source].short : t("المصدر البديل"),
              })
            : t("إلى {0}", { 0: e.to_source ? SOURCE_META[e.to_source].name : "—" })}
        </p>
        <p className="text-[11px] leading-5 text-muted">
          {reason}
          {restored
            ? dead !== null && (
                <>
                  {reason && " • "}
                  {t("مدة الانقطاع")} <bdi className="whitespace-nowrap">{fmtDuration(dead)}</bdi>
                </>
              )
            : !failed &&
              (detect !== null || dead !== null) && (
                <>
                  {reason && " • "}
                  {t("كشف")}{" "}
                  <bdi className="whitespace-nowrap">{detect !== null ? fmtMs(detect) : "—"}</bdi>{" "}
                  {t("• انقطاع")}{" "}
                  <bdi className="whitespace-nowrap">{dead !== null ? fmtMs(dead) : "—"}</bdi>
                </>
              )}
        </p>
      </div>
      <div className="text-end">
        <p className="num text-[12px] font-semibold text-ink-2">{fmtTime(at, tz)}</p>
        {failed ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-danger">
            <CircleX className="size-3" /> {t("فشل")}
          </span>
        ) : (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-ok">
            <CircleCheck className="size-3" /> {t("ناجح")}
          </span>
        )}
      </div>
    </div>
  );
}
