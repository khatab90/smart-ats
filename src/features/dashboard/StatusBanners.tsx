import { CircleAlert, Lock, Settings2, ShieldAlert, Wifi, type Zap } from "lucide-react";
import { ALARM_LABEL, SOURCE_META } from "../../data/meta";
import { cn } from "../../lib/cn";
import { fmtAgo, fmtTime } from "../../lib/format";
import { useActiveDevice, useNow } from "../../store/devices";
import { useNav } from "../../store/nav";
import { t } from "../../i18n";

export function StatusBanners() {
  const { status, link, settings, isAdmin, serverNow } = useActiveDevice();
  const { push } = useNav();
  useNow(5000);
  const tz = settings?.timezone;
  const lastSeen = status?.last_seen_at ? Date.parse(status.last_seen_at) : null;
  const banners: React.ReactNode[] = [];

  // Two boards with this ID (server-side detection, migration 4). Shown
  // first: until it is resolved the readings may not be from your board.
  if (status?.duplicate_since) {
    banners.push(
      <Banner key="dup" tone="danger" icon={ShieldAlert} title={t("جهازان يرسلان بنفس المعرّف")}>
        {t(
          "تصل بيانات من جهازين مختلفين باسم هذا البورد منذ {0}. نعرض البورد الذي بدأ أولاً وأوقفنا الآخر (لا تصله أوامرك). افصل الجهاز الزائد، مثل محاكٍ ما زال يعمل أو بورد قديم؛ وإذا لم تعرفه فقد يكون رمزه السري منسوخاً.",
          { 0: fmtTime(Date.parse(status.duplicate_since), tz) },
        )}
      </Banner>,
    );
  }

  // Banners are only for problems that need attention. What the hero or a
  // card already shows (offline, no source, manual mode) is not repeated
  // here. A board that never reported gets its own screen (WaitingForBoard).
  if (link === "live" || link === "stale") {
    if (link === "stale") {
      banners.push(
        <Banner key="stale" tone="warn" icon={Wifi} title={t("البيانات متأخرة")}>
          {t("آخر تحديث")} {lastSeen ? fmtAgo(lastSeen, serverNow()) : "—"}
          {t(". قد لا تعكس القراءات الحالة الحالية.")}
        </Banner>,
      );
    }
    if (status?.system_state === "lockout") {
      banners.push(
        <Banner key="lock" tone="danger" icon={Lock} title={t("النظام مقفل بالحماية")}>
          {(status.alarms ?? []).map((a) => ALARM_LABEL[a] ?? a).join(t("، ")) ||
            t("يتطلب فحصاً في الموقع قبل إعادة التشغيل.")}
        </Banner>,
      );
    } else if (status?.alarms?.length) {
      banners.push(
        <Banner key="alarms" tone="warn" icon={CircleAlert} title={t("إنذارات البورد")}>
          {status.alarms.map((a) => ALARM_LABEL[a] ?? a).join(t("، "))}
        </Banner>,
      );
    }
    if (status?.override?.active) {
      banners.push(
        <Banner key="ovr" tone="warn" icon={ShieldAlert} title={t("الحماية تجاوزت اختيارك")}>
          {status.override.requested
            ? t("المصدر المختار ({0}) ", { 0: SOURCE_META[status.override.requested].name })
            : t("المصدر المختار ")}
          {t("خرج عن حدود التشغيل، فنقل البورد الحمل إلى")}{" "}
          {status.active_source ? SOURCE_META[status.active_source].name : t("المصدر المتاح")}
          {t(". لن يعود البورد إليه تلقائياً في الوضع اليدوي؛ اختره من جديد بعد استقراره.")}
        </Banner>,
      );
    }
  }
  if (settings && (!settings.nominal_voltage || !settings.nominal_frequency)) {
    banners.push(
      <Banner
        key="cfg"
        tone="warn"
        icon={Settings2}
        title={t("إعدادات الجهاز غير مكتملة")}
        action={isAdmin ? { label: t("ضبط"), onClick: () => push("settings") } : undefined}
      >
        {t("لم يُحدَّد الجهد والتردد الاسميان بعد، وهما أساس فحص صلاحية المصادر.")}
      </Banner>,
    );
  }
  return banners.length ? <div className="space-y-3">{banners}</div> : null;
}

function Banner({
  tone,
  icon: Icon,
  title,
  children,
  action,
}: {
  tone: "warn" | "danger";
  icon: typeof Zap;
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const cls =
    tone === "danger"
      ? "border-danger/20 bg-danger-soft text-danger-strong"
      : "border-warn/25 bg-warn-soft text-warn-strong";
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", cls)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold">{title}</p>
        <p className="mt-0.5 text-[12px] leading-5 opacity-90">{children}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-xl bg-surface/70 px-3 py-1.5 text-[12px] font-bold"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
