import { Wifi, WifiOff } from "lucide-react";
import { Card, SectionTitle, StatusDot } from "../../components/ui";
import { cn } from "../../lib/cn";
import { fmtAgo } from "../../lib/format";
import { useActiveDevice, useNow } from "../../store/devices";
import { t } from "../../i18n";

function SignalBars({ rssi, on }: { rssi: number | null; on: boolean }) {
  const level = !on || rssi === null ? 0 : rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <span
      className="flex items-end gap-0.5"
      dir="ltr"
      aria-label={rssi !== null ? t("قوة الإشارة {0} dBm", { 0: rssi }) : t("لا توجد قراءة")}
    >
      {[1, 2, 3, 4].map((b) => (
        <span
          key={b}
          className={cn("w-1 rounded-sm", b <= level ? "bg-ok" : "bg-line")}
          style={{ height: 4 + b * 3 }}
        />
      ))}
    </span>
  );
}

export function ConnectionCard() {
  const { device, status, link, settings, settingsApplied, realtime, serverNow } =
    useActiveDevice();
  useNow(5000);
  if (!device) return null;
  const live = link === "live" || link === "stale";
  const lastSeen = status?.last_seen_at ? Date.parse(status.last_seen_at) : null;
  return (
    <div>
      <SectionTitle title={t("الاتصال بالبورد")} />
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-2xl",
              live ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger",
            )}
          >
            {live ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              {link === "live"
                ? t("متصل")
                : link === "stale"
                  ? t("بيانات متأخرة")
                  : link === "offline"
                    ? t("غير متصل")
                    : t("لم يتصل بعد")}
              <StatusDot
                tone={link === "live" ? "ok" : link === "stale" ? "warn" : "danger"}
                pulse={link === "live"}
              />
            </p>
            <p className="truncate text-[12px] text-muted">
              ESP32 •{" "}
              {realtime === "live"
                ? t("تحديث لحظي")
                : realtime === "polling"
                  ? t("تحديث كل 5 ث")
                  : t("جارٍ الاتصال بالخادم")}
            </p>
          </div>
          <div className="text-end">
            <SignalBars rssi={status?.rssi ?? null} on={link === "live"} />
            <p className="num mt-1 text-[10px] text-faint" dir="ltr">
              {link === "live" && status?.rssi !== null && status?.rssi !== undefined
                ? `${status.rssi} dBm`
                : "—"}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-3 text-center">
          <div>
            <p className="text-[10px] text-muted">Device ID</p>
            <p className="num mt-0.5 truncate text-[12px] font-semibold text-ink" dir="ltr">
              {device.id}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted">{t("آخر تحديث")}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink">
              {lastSeen ? fmtAgo(lastSeen, serverNow()) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted">{t("البرنامج الثابت")}</p>
            <p className="num mt-0.5 text-[12px] font-semibold text-ink" dir="ltr">
              {device.firmware ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted">{t("إصدار الإعدادات")}</p>
            <p className="num mt-0.5 text-[12px] font-semibold text-ink">
              {status?.config_version ?? "—"} / {settings?.version ?? "—"}
              <span className={cn("ms-1 text-[10px]", settingsApplied ? "text-ok" : "text-warn")}>
                {settingsApplied ? t("مطبّق") : t("معلّق")}
              </span>
            </p>
          </div>
        </div>
        {live && status?.clock_invalid && (
          <p className="mt-3 rounded-2xl bg-warn-soft px-3 py-2 text-[11px] leading-5 text-warn-strong">
            {t(
              "ساعة البورد غير مضبوطة، فيستخدم الخادم وقته لتسجيل القراءات والأحداث. تأكد من وصول البورد إلى خدمة الوقت (NTP).",
            )}
          </p>
        )}
        {(status?.skipped_events ?? 0) > 0 && (
          <p className="mt-2 text-[11px] leading-5 text-muted">
            {t("تجاهل الخادم")} {status?.skipped_events}{" "}
            {t("حدثاً غير صالح من البورد. باقي البيانات حُفظت بشكل طبيعي.")}
          </p>
        )}
        {(status?.controller?.dropped_events ?? 0) > 0 && (
          <p className="mt-2 text-[11px] leading-5 text-muted">
            {t("امتلأت ذاكرة البورد أثناء انقطاع الاتصال، وفُقد")} {status?.controller?.dropped_events}{" "}
            {t("حدثاً قديماً.")}
          </p>
        )}
      </Card>
    </div>
  );
}
