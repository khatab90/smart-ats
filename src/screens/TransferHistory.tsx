import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Chips, EmptyState, ErrorState, ScreenHeader, Skeleton } from "../components/ui";
import { SOURCE_META } from "../data/meta";
import type { EventRow, SourceId } from "../data/types";
import { installedSources } from "../domain/sources";
import {
  QUERY_TYPES,
  SwitchRow,
  isListed,
  isManual,
  type Filter,
} from "../features/logs/SwitchLog";
import { useEvents } from "../hooks/data";
import { cn } from "../lib/cn";
import { fmtDayLabel } from "../lib/format";
import { addDaysInTz, startOfDayInTz } from "../lib/tz";
import { useActiveDevice, useNow } from "../store/devices";
import { useNav } from "../store/nav";
import { t } from "../i18n";

/** True when the event involves the source: switched to it, away from it, or it failed. */
function involves(e: EventRow, s: SourceId) {
  return e.to_source === s || e.from_source === s;
}

/** The full transfer log, filtered by kind and by source. */
export function TransferHistory() {
  const { device, status, settings, serverNow } = useActiveDevice();
  const { back } = useNav();
  const tz = settings?.timezone ?? "UTC";
  const now = useNow(60_000);
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState<SourceId | "all">("all");
  const since = useMemo(() => addDaysInTz(serverNow(), -(days - 1), tz), [days, tz, serverNow]);
  const { data, loading, error, reload } = useEvents(device?.id ?? null, QUERY_TYPES, since);
  const installed = installedSources(status);

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

  const bySource = data.filter((e) => isListed(e) && (source === "all" || involves(e, source)));
  const filtered = bySource.filter((e) => {
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

  return (
    <div className="pb-10">
      <ScreenHeader
        title={t("سجل التحويلات")}
        subtitle={device ? device.name || device.id : undefined}
        onBack={back}
      />
      <div className="space-y-4 px-5">
        <div>
          <p className="mb-2 px-1 text-[12px] font-semibold text-muted">{t("المصدر")}</p>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            <SourceChip active={source === "all"} onClick={() => setSource("all")}>
              {t("كل المصادر")}
            </SourceChip>
            {installed.map((s) => (
              <SourceChip key={s} active={source === s} onClick={() => setSource(s)}>
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: SOURCE_META[s].color }}
                />
                {SOURCE_META[s].short}
              </SourceChip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 px-1 text-[12px] font-semibold text-muted">{t("نوع العملية")}</p>
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("الكل") },
              { value: "smart", label: t("الوضع الذكي") },
              { value: "manual", label: t("يدوي") },
              {
                value: "failed",
                label: t("فاشلة"),
                count: bySource.filter((e) => e.type === "transfer_failed").length,
              },
              { value: "no_source", label: t("انقطاع كلي") },
            ]}
          />
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <Skeleton className="h-64" />
        ) : groups.length === 0 ? (
          <Card className="pt-2">
            <EmptyState
              icon={History}
              title={t("لا توجد عمليات")}
              body={t("لم يسجّل البورد أي عملية مطابقة خلال آخر {0} أيام.", { 0: days })}
            />
          </Card>
        ) : (
          groups.map(([day, events]) => (
            <div key={day}>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[13px] font-bold text-ink">{fmtDayLabel(day, now, tz)}</p>
                <span className="text-[11px] text-muted">
                  {events.length} {t("سجل")}
                </span>
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {events.map((e) => (
                  <SwitchRow key={e.id} e={e} tz={tz} noSourceEnd={noSourceEnd.get(e.id)} />
                ))}
              </Card>
            </div>
          ))
        )}

        {!loading && !error && (
          <button
            type="button"
            onClick={() => setDays((d) => d + 7)}
            className="w-full rounded-2xl border border-dashed border-line py-3 text-[13px] font-semibold text-brand-600 hover:border-brand-200"
          >
            {t("عرض أيام أقدم")}
          </button>
        )}
      </div>
    </div>
  );
}

function SourceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-[13px] font-semibold transition",
        active
          ? "border-brand-800 bg-brand-800 text-white"
          : "border-line bg-surface text-ink-2 hover:border-brand-200",
      )}
    >
      {children}
    </button>
  );
}
