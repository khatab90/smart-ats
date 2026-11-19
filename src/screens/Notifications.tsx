import {
  BellOff,
  CheckCheck,
  CircleAlert,
  TriangleAlert,
  Settings2,
  Trash2,
  WifiOff,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Chips,
  EmptyState,
  ErrorState,
  IconButton,
  ScreenHeader,
  Sheet,
  Skeleton,
  Toggle,
} from "../components/ui";
import { NOTIF_META, NOTIF_ORDER } from "../data/meta";
import type { NotificationPrefs, NotificationRow, NotificationType } from "../data/types";
import { cn } from "../lib/cn";
import { fmtAgo, fmtTime } from "../lib/format";
import { startOfDayInTz } from "../lib/tz";
import { useDevices, useNow } from "../store/devices";
import { useNav } from "../store/nav";
import { useNotifications } from "../store/notifications";
import { notificationText } from "../domain/notifications";

const ICON: Record<NotificationType, LucideIcon> = {
  source_outage: ZapOff,
  transfer: Zap,
  electrical_fault: CircleAlert,
  connection_lost: WifiOff,
  transfer_failed: CircleAlert,
};

export function Notifications() {
  const { items, loading, error, reload, markRead, markAllRead, remove, unreadCount } =
    useNotifications();
  const { memberships, setActiveId } = useDevices();
  const { back, go } = useNav();
  const now = useNow(15_000);
  const [filter, setFilter] = useState<"all" | NotificationType>("all");
  const [settings, setSettings] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const list = items.filter((n) => filter === "all" || n.type === filter);
  const dayStart = startOfDayInTz(now, tz);
  const today = list.filter((n) => Date.parse(n.created_at) >= dayStart);
  const earlier = list.filter((n) => Date.parse(n.created_at) < dayStart);
  const deviceName = (id: string) => memberships.find((m) => m.device.id === id)?.device.name || id;

  const open = (n: NotificationRow) => {
    void markRead(n.id);
    if (memberships.some((m) => m.device.id === n.device_id)) setActiveId(n.device_id);
    if (n.type === "transfer" || n.type === "transfer_failed" || n.type === "source_outage")
      go("logs", "switch");
    else go("home");
  };

  return (
    <div className="pb-10">
      <ScreenHeader
        title="الإشعارات"
        subtitle={unreadCount ? `${unreadCount} غير مقروءة` : "لا توجد إشعارات جديدة"}
        onBack={back}
        right={
          <div className="flex gap-2">
            <IconButton
              icon={CheckCheck}
              label="تحديد الكل كمقروء"
              onClick={() => void markAllRead()}
            />
            <IconButton
              icon={Settings2}
              label="إعدادات الإشعارات"
              onClick={() => setSettings(true)}
            />
          </div>
        }
      />
      <div className="space-y-4 px-5">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "الكل", count: items.length },
            ...NOTIF_ORDER.map((t) => ({
              value: t,
              label: NOTIF_META[t].label,
              count: items.filter((n) => n.type === t).length,
            })),
          ]}
        />
        {error && <ErrorState message={error} onRetry={reload} />}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="لا توجد إشعارات"
            body="تصل الإشعارات هنا عند حدوث انقطاع أو تحويل أو خلل كهربائي أو فقدان الاتصال بالبورد."
          />
        ) : (
          [
            { title: "اليوم", items: today },
            { title: "سابقاً", items: earlier },
          ].map(
            (g) =>
              g.items.length > 0 && (
                <div key={g.title}>
                  <p className="mb-2 text-[13px] font-bold text-ink">{g.title}</p>
                  <div className="space-y-2">
                    {g.items.map((n) => {
                      const Icon = ICON[n.type];
                      const meta = NOTIF_META[n.type];
                      const at = Date.parse(n.created_at);
                      return (
                        <div
                          key={n.id}
                          className={cn(
                            "group relative flex items-start gap-3 rounded-[20px] border p-3.5 transition",
                            n.read_at
                              ? "border-line/80 bg-surface"
                              : n.critical
                                ? "border-danger/30 bg-danger-soft/40"
                                : "border-brand-200 bg-brand-50/60",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => open(n)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-start"
                          >
                            <span
                              className={cn(
                                "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                                meta.bg,
                                meta.text,
                              )}
                            >
                              <Icon className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[13px] font-bold text-ink">
                                  {notificationText(n).title}
                                </span>
                                {!n.read_at && (
                                  <span className="size-2 shrink-0 rounded-full bg-brand-500" />
                                )}
                              </span>
                              <span className="mt-0.5 block text-[12px] leading-5 text-muted">
                                {notificationText(n).body}
                              </span>
                              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
                                <span className={cn("font-semibold", meta.text)}>{meta.label}</span>
                                •<span>{deviceName(n.device_id)}</span>•
                                <span className="num">
                                  {at >= dayStart ? fmtTime(at) : fmtAgo(at, now)}
                                </span>
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label="حذف الإشعار"
                            onClick={() => void remove(n.id)}
                            className="rounded-lg p-2 text-faint transition hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
          )
        )}
      </div>
      <NotificationSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

export function NotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, savePrefs } = useNotifications();
  return (
    <Sheet open={open} onClose={onClose} title="إعدادات الإشعارات">
      <div className="divide-y divide-line rounded-2xl border border-line">
        {NOTIF_ORDER.map((t) => {
          const meta = NOTIF_META[t];
          const key = t as keyof NotificationPrefs;
          return (
            <div key={t} className="flex items-center gap-3 p-3.5">
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-ink">{meta.label}</p>
                <p className="text-[11px] leading-5 text-muted">{meta.desc}</p>
                {meta.critical && !prefs[key] && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-danger-strong">
                    <TriangleAlert className="size-3" /> إنذار حرج موقوف: لن تعرف بانقطاع الكهرباء
                    أو فشل التحويل.
                  </p>
                )}
              </div>
              <Toggle
                checked={Boolean(prefs[key])}
                onChange={(v) => void savePrefs({ [key]: v })}
                label={meta.label}
              />
            </div>
          );
        })}
        <div className="flex items-center gap-3 p-3.5">
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-ink">صوت التنبيه</p>
            <p className="text-[11px] text-muted">
              صوت مع كل إشعار جديد. الإنذارات الحرجة تصدر صوتاً دائماً.
            </p>
          </div>
          <Toggle
            checked={prefs.sound}
            onChange={(v) => void savePrefs({ sound: v })}
            label="صوت التنبيه"
          />
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted">
        «انقطاع المصدر الحالي» و«فشل عملية التحويل» إنذاران حرجان، ويُنصح بإبقائهما مفعّلين. إيقاف أي
        نوع يوقف التنبيه فقط، ويبقى الحدث مسجلاً في سجل أحداث الجهاز.
      </p>
    </Sheet>
  );
}
