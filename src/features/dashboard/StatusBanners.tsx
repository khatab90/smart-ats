import {
  CircleAlert,
  Clock3,
  Hand,
  LoaderCircle,
  Lock,
  Settings2,
  ShieldAlert,
  Wifi,
  WifiOff,
  type Zap,
  ZapOff,
} from "lucide-react";
import { ALARM_LABEL, SOURCE_META, SOURCE_ORDER, UNAVAILABLE_REASON } from "../../data/meta";
import { cn } from "../../lib/cn";
import { fmtAgo, fmtTime } from "../../lib/format";
import { useActiveDevice, useNow } from "../../store/devices";
import { useNav } from "../../store/nav";

export function StatusBanners() {
  const { status, link, settings, settingsApplied, isAdmin, serverNow } = useActiveDevice();
  const { push } = useNav();
  useNow(5000);
  const tz = settings?.timezone;
  const lastSeen = status?.last_seen_at ? Date.parse(status.last_seen_at) : null;
  const banners: React.ReactNode[] = [];

  if (link === "never") {
    banners.push(
      <Banner key="never" tone="info" icon={Clock3} title="بانتظار أول بيانات من البورد">
        لم تصل أي قراءة من هذا الجهاز بعد. تأكد من تشغيل البورد واتصاله بالإنترنت.
      </Banner>,
    );
  } else if (link === "offline") {
    banners.push(
      <Banner key="off" tone="danger" icon={WifiOff} title="البورد غير متصل">
        آخر حالة معروفة في {lastSeen ? fmtTime(lastSeen, tz) : "—"} (
        {lastSeen ? fmtAgo(lastSeen, serverNow()) : "—"}). أزرار التحكم معطلة حتى يعود الاتصال.
      </Banner>,
    );
  } else {
    if (link === "stale") {
      banners.push(
        <Banner key="stale" tone="warn" icon={Wifi} title="البيانات متأخرة">
          آخر تحديث {lastSeen ? fmtAgo(lastSeen, serverNow()) : "—"}. قد لا تعكس القراءات الحالة
          الحالية.
        </Banner>,
      );
    }
    if (status?.system_state === "no_source") {
      const reasons = SOURCE_ORDER.filter(
        (id) => status.sources?.[id]?.reason !== "not_installed",
      ).map((id) => {
        const r = status.sources?.[id];
        return `${SOURCE_META[id].short}: ${UNAVAILABLE_REASON[r?.reason ?? ""] ?? "غير متاح"}`;
      });
      banners.push(
        <div
          key="nosrc"
          role="alert"
          className="rounded-[22px] bg-danger px-4 py-4 text-white shadow-[0_12px_28px_-14px_rgba(229,55,43,0.9)]"
        >
          <p className="flex items-center gap-2 text-[16px] font-bold">
            <ZapOff className="size-5" /> لا يوجد مصدر متاح
          </p>
          <p className="mt-1 text-[13px] text-white/90">
            الأحمال بدون كهرباء. لا يوجد أي مصدر صالح للتشغيل حالياً.
          </p>
          <p className="mt-2 text-[12px] leading-5 text-white/85">{reasons.join(" • ")}</p>
        </div>,
      );
    }
    if (status?.system_state === "lockout") {
      banners.push(
        <Banner key="lock" tone="danger" icon={Lock} title="النظام مقفل بالحماية">
          {(status.alarms ?? []).map((a) => ALARM_LABEL[a] ?? a).join("، ") ||
            "يتطلب فحصاً في الموقع قبل إعادة التشغيل."}
        </Banner>,
      );
    } else if (status?.alarms?.length) {
      banners.push(
        <Banner key="alarms" tone="warn" icon={CircleAlert} title="إنذارات البورد">
          {status.alarms.map((a) => ALARM_LABEL[a] ?? a).join("، ")}
        </Banner>,
      );
    }
    if (status?.override?.active) {
      banners.push(
        <Banner key="ovr" tone="warn" icon={ShieldAlert} title="الحماية تجاوزت اختيارك">
          {status.override.requested
            ? `المصدر المختار (${SOURCE_META[status.override.requested].name}) `
            : "المصدر المختار "}
          خرج عن حدود التشغيل، فنقل البورد الحمل إلى{" "}
          {status.active_source ? SOURCE_META[status.active_source].name : "المصدر المتاح"}. لن يعود
          البورد إليه تلقائياً في الوضع اليدوي؛ اختره من جديد بعد استقراره.
        </Banner>,
      );
    }
    if (status?.mode === "manual") {
      const revert =
        settings?.manual_revert_min && status.mode_since
          ? Date.parse(status.mode_since) + settings.manual_revert_min * 60_000 - serverNow()
          : null;
      banners.push(
        <Banner key="manual" tone="info" icon={Hand} title="الوضع اليدوي مفعّل">
          البورد لا يختار المصدر تلقائياً حسب الأولوية.
          {revert !== null && revert > 0
            ? ` سيعود إلى الوضع الذكي خلال ${Math.ceil(revert / 60_000)} د.`
            : ""}
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
        title="إعدادات الجهاز غير مكتملة"
        action={isAdmin ? { label: "ضبط", onClick: () => push("settings") } : undefined}
      >
        لم يُحدَّد الجهد والتردد الاسميان بعد، وهما أساس فحص صلاحية المصادر.
      </Banner>,
    );
  } else if (settings && !settingsApplied && link !== "never") {
    banners.push(
      <Banner key="pending" tone="info" icon={LoaderCircle} title="بانتظار تأكيد البورد للإعدادات">
        الإصدار {settings.version} محفوظ، ولم يؤكد البورد تطبيقه بعد.
      </Banner>,
    );
  }
  return banners.length ? <div className="space-y-3">{banners}</div> : null;
}

export function Banner({
  tone,
  icon: Icon,
  title,
  children,
  action,
}: {
  tone: "info" | "warn" | "danger";
  icon: typeof Zap;
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const cls =
    tone === "danger"
      ? "border-danger/20 bg-danger-soft text-danger-strong"
      : tone === "warn"
        ? "border-warn/25 bg-warn-soft text-warn-strong"
        : "border-brand-200 bg-brand-50 text-brand-800";
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", cls)}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "info" && Icon === LoaderCircle && "animate-spin",
        )}
      />
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
