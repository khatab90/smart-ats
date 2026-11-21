import {
  Clock3,
  Cpu,
  Fingerprint,
  RotateCcw,
  Settings2,
  Thermometer,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { NoDevice } from "../components/DeviceGate";
import { Card, RowGroup, ScreenHeader } from "../components/ui";
import { resetReasonText, signalWord } from "../features/device/health";
import { cn } from "../lib/cn";
import { fmtAgo, fmtDateTime, fmtDuration } from "../lib/format";
import { useActiveDevice, useNow } from "../store/devices";
import { useNav } from "../store/nav";
import { t, uiStart } from "../i18n";

function Item({
  icon: Icon,
  label,
  value,
  ltr,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  ltr?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-2">
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-muted">{label}</p>
        <p
          className={cn("mt-0.5 truncate text-[14px] font-semibold text-ink", ltr && "num")}
          dir={ltr ? "ltr" : undefined}
          style={ltr ? { textAlign: uiStart() } : undefined}
        >
          {value}
        </p>
        {note && <p className="mt-1 text-[11px] leading-5 text-muted">{note}</p>}
      </div>
    </div>
  );
}

/**
 * Technical details of the board, for the owner and for support: identity,
 * software, connection, health and whether the settings reached it.
 */
export function DeviceInfo() {
  const { device, status, link, settings, settingsApplied, serverNow } = useActiveDevice();
  const { back } = useNav();
  useNow(5000);
  const tz = settings?.timezone;
  const live = link === "live" || link === "stale";
  const lastSeen = status?.last_seen_at ? Date.parse(status.last_seen_at) : null;
  const c = status?.controller;
  const rssi = live ? (status?.rssi ?? null) : null;
  const signal = signalWord(rssi);

  return (
    <div className="pb-10">
      <ScreenHeader
        title={t("معلومات الجهاز")}
        subtitle={device ? device.name || device.id : undefined}
        onBack={back}
      />
      <div className="space-y-5 px-5">
        {!device ? (
          <NoDevice body={t("أضف جهازاً لعرض معلوماته.")} />
        ) : (
          <>
            <RowGroup title={t("الجهاز")}>
              <Item icon={Fingerprint} label={t("معرّف الجهاز")} value={device.id} ltr />
              <Item
                icon={Cpu}
                label={t("إصدار برنامج البورد")}
                value={device.firmware ?? t("غير معروف")}
                ltr={Boolean(device.firmware)}
              />
            </RowGroup>

            <RowGroup title={t("الاتصال")}>
              <Item
                icon={Clock3}
                label={t("آخر تواصل")}
                value={
                  lastSeen
                    ? `${fmtAgo(lastSeen, serverNow())} • ${fmtDateTime(lastSeen, tz)}`
                    : t("لم يتصل بعد")
                }
              />
              <Item
                icon={Wifi}
                label={t("قوة إشارة الواي فاي")}
                value={signal ? `${signal} (${rssi} dBm)` : "—"}
                note={!live && lastSeen ? t("تظهر أثناء اتصال البورد.") : undefined}
              />
            </RowGroup>

            <RowGroup title={t("حالة البورد")}>
              <Item
                icon={RotateCcw}
                label={t("يعمل منذ")}
                value={live && c?.uptime_s !== undefined ? fmtDuration(c.uptime_s * 1000) : "—"}
                note={
                  resetReasonText(c?.reset_reason)
                    ? t("سبب آخر تشغيل: {0}", { 0: resetReasonText(c?.reset_reason) })
                    : undefined
                }
              />
              <Item
                icon={Thermometer}
                label={t("حرارة المتحكم")}
                value={live && c?.temp_c !== undefined ? `${Math.round(c.temp_c)} °C` : "—"}
              />
              <Item
                icon={Zap}
                label={t("جهد تغذية البورد")}
                value={live && c?.supply_v !== undefined ? `${c.supply_v.toFixed(2)} V` : "—"}
              />
            </RowGroup>

            <RowGroup title={t("الإعدادات")}>
              <Item
                icon={Settings2}
                label={t("آخر تعديل")}
                value={settings ? fmtDateTime(Date.parse(settings.updated_at), tz) : "—"}
                note={
                  settings
                    ? settingsApplied
                      ? t("مطبّقة على البورد.")
                      : t("محفوظة، وبانتظار أن يطبقها البورد عند اتصاله.")
                    : undefined
                }
              />
            </RowGroup>

            {(status?.clock_invalid ||
              (status?.skipped_events ?? 0) > 0 ||
              (c?.dropped_events ?? 0) > 0) && (
              <Card className="space-y-2 p-4 text-[12px] leading-5 text-muted">
                {live && status?.clock_invalid && (
                  <p className="text-warn-strong">
                    {t(
                      "ساعة البورد غير مضبوطة، فيستخدم الخادم وقته لتسجيل القراءات والأحداث. تأكد من وصول البورد إلى خدمة الوقت (NTP).",
                    )}
                  </p>
                )}
                {(status?.skipped_events ?? 0) > 0 && (
                  <p>
                    {t("تجاهل الخادم")} {status?.skipped_events}{" "}
                    {t("حدثاً غير صالح من البورد. باقي البيانات حُفظت بشكل طبيعي.")}
                  </p>
                )}
                {(c?.dropped_events ?? 0) > 0 && (
                  <p>
                    {t("امتلأت ذاكرة البورد أثناء انقطاع الاتصال، وفُقد")} {c?.dropped_events}{" "}
                    {t("حدثاً قديماً.")}
                  </p>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
