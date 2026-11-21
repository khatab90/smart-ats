import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, EmptyState, ErrorState, ScreenHeader, Segmented, Skeleton } from "../components/ui";
import type { EventRow } from "../data/types";
import {
  ENTRY_COUNT,
  QUERY_TYPES,
  SwitchRow,
  isListed,
  type Filter,
} from "../features/logs/SwitchLog";
import { useEvents } from "../hooks/data";
import { arCount, fmtDayLabel } from "../lib/format";
import { addDaysInTz, startOfDayInTz } from "../lib/tz";
import { useActiveDevice, useNow } from "../store/devices";
import { useNav } from "../store/nav";
import { t } from "../i18n";

/** The full transfer log, with one simple filter. */
export function TransferHistory() {
  const { device, settings, serverNow } = useActiveDevice();
  const { back } = useNav();
  const tz = settings?.timezone ?? "UTC";
  const now = useNow(60_000);
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Filter>("all");
  const since = useMemo(() => addDaysInTz(serverNow(), -(days - 1), tz), [days, tz, serverNow]);
  const { data, loading, error, reload } = useEvents(device?.id ?? null, QUERY_TYPES, since);

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

  const listed = data.filter(isListed);
  const failedCount = listed.filter((e) => e.type === "transfer_failed").length;
  const filtered = listed.filter((e) => {
    if (filter === "ok") return e.type === "transfer_completed";
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
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("الكل") },
            { value: "ok", label: t("ناجحة") },
            {
              value: "failed",
              label: failedCount ? t("فاشلة ({0})", { 0: failedCount }) : t("فاشلة"),
            },
            { value: "no_source", label: t("انقطاع") },
          ]}
        />

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
                  {arCount(events.length, ENTRY_COUNT)}
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
