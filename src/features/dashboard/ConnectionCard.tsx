import { Wifi, WifiOff } from "lucide-react";
import { Card, SectionTitle, StatusDot } from "../../components/ui";
import { cn } from "../../lib/cn";
import { fmtAgo } from "../../lib/format";
import { useActiveDevice, useNow } from "../../store/devices";

export function SignalBars({ rssi, on }: { rssi: number | null; on: boolean }) {
  const level = !on || rssi === null ? 0 : rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <span
      className="flex items-end gap-0.5"
      dir="ltr"
      aria-label={rssi !== null ? `قوة الإشارة ${rssi} dBm` : "لا توجد قراءة"}
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
      <SectionTitle title="الاتصال بالبورد" />
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
                ? "متصل"
                : link === "stale"
                  ? "بيانات متأخرة"
                  : link === "offline"
                    ? "غير متصل"
                    : "لم يتصل بعد"}
              <StatusDot
                tone={link === "live" ? "ok" : link === "stale" ? "warn" : "danger"}
                pulse={link === "live"}
              />
            </p>
            <p className="truncate text-[12px] text-muted">
              ESP32 •{" "}
              {realtime === "live"
                ? "تحديث لحظي"
                : realtime === "polling"
                  ? "تحديث كل 5 ث"
                  : "جارٍ الاتصال بالخادم"}
            </p>
          </div>
          <div className="text-left">
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
            <p className="text-[10px] text-muted">آخر تحديث</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink">
              {lastSeen ? fmtAgo(lastSeen, serverNow()) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted">البرنامج الثابت</p>
            <p className="num mt-0.5 text-[12px] font-semibold text-ink" dir="ltr">
              {device.firmware ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted">إصدار الإعدادات</p>
            <p className="num mt-0.5 text-[12px] font-semibold text-ink">
              {status?.config_version ?? "—"} / {settings?.version ?? "—"}
              <span className={cn("ms-1 text-[10px]", settingsApplied ? "text-ok" : "text-warn")}>
                {settingsApplied ? "مطبّق" : "معلّق"}
              </span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
