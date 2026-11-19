import { Card, InfoHint, Skeleton } from "../../components/ui";
import { useEnergy, useEvents } from "../../hooks/data";
import { fmtNum } from "../../lib/format";
import { startOfDayInTz } from "../../lib/tz";
import { useActiveDevice, useNow } from "../../store/devices";
import { t } from "../../i18n";

export function TodayStats() {
  const { device, settings, serverNow, link } = useActiveDevice();
  const tz = settings?.timezone ?? "UTC";
  useNow(60_000); // re-render each minute so "today" rolls over at midnight
  // Stable within a day, so the data hooks below only refetch at midnight.
  const dayStart = startOfDayInTz(serverNow(), tz);
  const energy = useEnergy(device?.id ?? null, dayStart);
  const transfers = useEvents(device?.id ?? null, ["transfer_completed"], dayStart);
  const kwh = energy.data.reduce((a, r) => a + r.wh, 0) / 1000;
  const loading = energy.loading || transfers.loading;
  const hasEnergy = energy.data.length > 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-3.5">
        <p className="flex items-center justify-between text-[11px] text-muted">
          {t("استهلاك اليوم")}
          <InfoHint
            text={t(
              "مجموع الطاقة المسجلة بعدادات البورد لكل المصادر منذ منتصف الليل بتوقيت الجهاز.",
            )}
          />
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-20" />
        ) : (
          <p className="num mt-1 text-[22px] leading-tight font-bold text-ink">
            {hasEnergy ? fmtNum(kwh, 1) : "—"}{" "}
            <span className="text-[11px] font-medium text-muted">kWh</span>
          </p>
        )}
        {!loading && !hasEnergy && (
          <p className="text-[11px] text-faint">
            {link === "never" ? t("لا توجد بيانات") : t("لا يوجد استهلاك مسجل")}
          </p>
        )}
      </Card>
      <Card className="p-3.5">
        <p className="flex items-center justify-between text-[11px] text-muted">
          {t("تحويلات اليوم")}
          <InfoHint
            text={t(
              "عدد عمليات التحويل الناجحة منذ منتصف الليل. المحاولات الفاشلة لا تُحتسب وتظهر في السجل.",
            )}
          />
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-12" />
        ) : (
          <p className="num mt-1 text-[22px] leading-tight font-bold text-ink">
            {transfers.data.length}{" "}
            <span className="text-[11px] font-medium text-muted">{t("عملية")}</span>
          </p>
        )}
      </Card>
    </div>
  );
}
