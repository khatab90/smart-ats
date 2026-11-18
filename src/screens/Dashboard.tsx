import {
  Bell,
  BrainCircuit,
  ChevronDown,
  CircleAlert,
  Clock3,
  Hand,
  LoaderCircle,
  Lock,
  Plus,
  Router,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  Zap,
  ZapOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CommandProgress, PriorityList } from "../components/control";
import { PowerFlow } from "../components/PowerFlow";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  InfoHint,
  SectionTitle,
  Segmented,
  Sheet,
  Skeleton,
  SourceIcon,
  StatusDot,
  type Tone,
} from "../components/ui";
import {
  ALARM_LABEL,
  MODE_LABEL,
  SOURCE_META,
  SOURCE_ORDER,
  UNAVAILABLE_REASON,
} from "../data/meta";
import type { DeviceStatus, SourceId, SourceReport, SystemMode } from "../data/types";
import { useEnergy, useEvents } from "../hooks/data";
import { useCommand } from "../hooks/useCommand";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { fmtAgo, fmtClock, fmtKw, fmtNum, fmtReading, fmtTime } from "../lib/format";
import type { LinkState } from "../lib/link";
import { isSelectable, predictSmartTarget } from "../lib/smart";
import { supabase } from "../lib/supabase";
import { startOfDayInTz } from "../lib/tz";
import { useAuth } from "../store/auth";
import { useActiveDevice, useDevices, useNow } from "../store/devices";
import { useNav } from "../store/nav";
import { useNotifications } from "../store/notifications";
import { useToast } from "../store/toast";

function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? "صباح الخير" : "مساء الخير";
}

export function sourceBadge(
  report: SourceReport | undefined,
  active: boolean,
): { label: string; tone: Tone } {
  if (active) return { label: "فعّال", tone: "ok" };
  if (!report) return { label: "لا توجد بيانات", tone: "neutral" };
  if (report.qualified) return { label: "متاح", tone: "info" };
  if (report.reason === "standby") return { label: UNAVAILABLE_REASON.standby, tone: "info" };
  if (report.reason === "qualifying" || (report.available && !report.qualified)) {
    const done = report.q_elapsed_s ?? null;
    const need = report.q_required_s ?? null;
    return {
      label: done !== null && need ? `قيد التأهيل ${done}/${need} ث` : "قيد التأهيل",
      tone: "warn",
    };
  }
  return { label: UNAVAILABLE_REASON[report.reason ?? ""] ?? "غير متاح", tone: "danger" };
}

const fmtVf = (r: SourceReport | undefined) => `${fmtReading(r?.v)} V • ${fmtReading(r?.f, 1)} Hz`;

export function Dashboard() {
  const { profile } = useAuth();
  const { memberships, loading, error, refresh } = useDevices();
  const { unreadCount } = useNotifications();
  const { push } = useNav();
  const [deviceSheet, setDeviceSheet] = useState(false);
  const ad = useActiveDevice();
  const firstName = profile?.full_name.split(" ")[0] ?? "";

  return (
    <div className="space-y-5 px-5 pt-4 pb-32">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-800 text-[15px] font-bold text-white">
          {firstName.charAt(0) || "S"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted">{greeting()}</p>
          <p className="truncate text-[17px] font-bold text-ink">{firstName || "مرحباً"}</p>
        </div>
        <IconButton
          icon={Bell}
          label="الإشعارات"
          badge={unreadCount}
          onClick={() => push("notifications")}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-72" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !memberships.length ? (
        <Card className="pt-4">
          <EmptyState
            icon={Router}
            title="لا يوجد جهاز مرتبط بحسابك"
            body="أضف بورد Smart ATS باستخدام معرّف الجهاز ورمز PIN، أو اطلب من مسؤول جهاز موجود دعوتك."
            action={
              <Button icon={Plus} onClick={() => push("addDevice")}>
                إضافة جهاز
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setDeviceSheet(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-start transition hover:border-brand-200"
          >
            <Router className="size-[18px] text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">
                {ad.device?.name || ad.device?.id}
              </span>
              <span
                className="num block text-[11px] text-muted"
                dir="ltr"
                style={{ textAlign: "right" }}
              >
                {ad.device?.id}
              </span>
            </span>
            <LinkBadge link={ad.link} />
            <ChevronDown className="size-4 text-faint" />
          </button>
          {ad.error && <ErrorState message={ad.error} onRetry={ad.refresh} />}
          <DeviceBody />
        </>
      )}
      <DeviceSheet open={deviceSheet} onClose={() => setDeviceSheet(false)} />
    </div>
  );
}

export function LinkBadge({ link }: { link: LinkState }) {
  if (link === "live")
    return (
      <Badge tone="ok" dot pulse>
        متصل
      </Badge>
    );
  if (link === "stale")
    return (
      <Badge tone="warn" dot>
        بيانات متأخرة
      </Badge>
    );
  if (link === "offline")
    return (
      <Badge tone="danger" dot>
        غير متصل
      </Badge>
    );
  return (
    <Badge tone="neutral" dot>
      لا توجد بيانات
    </Badge>
  );
}

function DeviceBody() {
  const ad = useActiveDevice();
  if (ad.loading && !ad.status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <>
      <StatusBanners />
      <Hero />
      <ModeCard />
      <TodayStats />
      <SourcesCard />
      <ConnectionCard />
    </>
  );
}

function StatusBanners() {
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
          {status.active_source ? SOURCE_META[status.active_source].name : "المصدر المتاح"}.
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

function Banner({
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
          className="shrink-0 rounded-xl bg-white/70 px-3 py-1.5 text-[12px] font-bold"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Hero() {
  const { status, link, settings, serverNow } = useActiveDevice();
  useNow(1000);
  const live = link === "live" || link === "stale";
  const tz = settings?.timezone;
  const active = status?.active_source ?? null;
  const meta = active ? SOURCE_META[active] : null;
  const state = status?.system_state;
  const lastSeen = status?.last_seen_at ? Date.parse(status.last_seen_at) : null;
  const metrics = live
    ? [
        { l: "الجهد", v: fmtReading(status?.load?.v), u: "V" },
        { l: "التيار", v: fmtReading(status?.load?.a, 1), u: "A" },
        { l: "القدرة", v: fmtKw(status?.load?.w), u: "kW" },
      ]
    : [
        { l: "الجهد", v: "—", u: "V" },
        { l: "التيار", v: "—", u: "A" },
        { l: "القدرة", v: "—", u: "kW" },
      ];

  let headline: React.ReactNode;
  if (link === "never") {
    headline = (
      <div>
        <p className="text-[22px] font-bold text-white/75">لا توجد بيانات حالياً</p>
        <p className="text-[12px] text-white/55">ستظهر الحالة فور وصول أول قراءة من البورد</p>
      </div>
    );
  } else if (!live) {
    headline = (
      <div>
        <p className="text-[22px] font-bold text-white/75">غير متصل</p>
        <p className="text-[12px] text-white/55">
          آخر حالة معروفة في {lastSeen ? fmtTime(lastSeen, tz) : "—"}:{" "}
          {state === "no_source" ? "لا يوجد مصدر" : meta ? meta.name : "غير معروف"}
        </p>
      </div>
    );
  } else if (state === "transferring") {
    headline = (
      <div>
        <p className="flex items-center gap-2 text-[22px] font-bold">
          <LoaderCircle className="size-5 animate-spin text-warn" />
          جارٍ التحويل…
        </p>
        <p className="text-[12px] text-white/60">
          فصل المصدر الحالي ثم توصيل المصدر الجديد بعد مهلة الأمان
        </p>
      </div>
    );
  } else if (state === "no_source" || !meta) {
    headline = (
      <div>
        <p className="flex items-center gap-2 text-[22px] font-bold text-[#ff8a80]">
          <ZapOff className="size-5" /> لا يوجد مصدر متاح
        </p>
        <p className="text-[12px] text-white/60">الأحمال غير مغذّاة بالطاقة</p>
      </div>
    );
  } else {
    const since = status?.active_since ? Date.parse(status.active_since) : null;
    headline = (
      <div>
        <p className="flex items-center gap-2 text-[24px] leading-tight font-bold tracking-tight">
          <span
            className="size-2.5 rounded-full"
            style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }}
          />
          {meta.name}
        </p>
        <p className="mt-0.5 text-[12px] text-white/60">
          يعمل منذ{" "}
          <span className="num font-semibold text-white" dir="ltr">
            {since ? fmtClock(serverNow() - since) : "—"}
          </span>
        </p>
      </div>
    );
  }

  return (
    <section className="hero-surface relative overflow-hidden rounded-[28px] p-5 text-white shadow-[0_24px_48px_-24px_rgba(10,31,61,0.8)]">
      <div className="hero-grid absolute inset-0" />
      <div className="relative flex items-center justify-between">
        <p className="text-[12px] font-medium text-white/60">المصدر الكهربائي الفعّال</p>
        {status?.mode && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
            {status.mode === "smart" ? (
              <BrainCircuit className="size-3.5" />
            ) : (
              <Hand className="size-3.5" />
            )}
            {MODE_LABEL[status.mode]}
          </span>
        )}
      </div>
      <div className="relative mt-3">{headline}</div>
      <div className="relative mt-3">
        <PowerFlow status={status} live={live} />
      </div>
      <div className="relative mt-6 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.07] py-3">
        {metrics.map((m) => (
          <div key={m.l} className="px-3 text-center">
            <p className="text-[11px] text-white/55">{m.l}</p>
            <p
              className={cn("num mt-0.5 text-[18px] font-bold", !live && "text-white/45")}
              dir="ltr"
            >
              {m.v}
              <span className="ms-1 text-[11px] font-medium text-white/55">{m.u}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModeCard() {
  const { status, settings, link, isAdmin, settingsApplied } = useActiveDevice();
  const { state, send, reset, busy } = useCommand();
  const [confirm, setConfirm] = useState<
    { kind: "mode"; mode: SystemMode } | { kind: "source"; source: SourceId } | null
  >(null);
  const mode = status?.mode ?? null;
  const canControl = isAdmin && link === "live";
  const priority = settings?.priority ?? SOURCE_ORDER;
  const prediction = predictSmartTarget(priority, status?.sources);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-ink">وضع النظام</p>
          <p className="text-[12px] text-muted">
            {mode === "smart"
              ? "البورد يختار المصدر حسب ترتيب الأولوية"
              : mode === "manual"
                ? "أنت تختار المصدر يدوياً"
                : "الوضع غير معروف حتى تصل بيانات من البورد"}
          </p>
        </div>
        <ShieldCheck className="size-5 text-ok" />
      </div>
      <Segmented
        className="mt-3"
        value={(mode ?? "") as SystemMode}
        onChange={(m) => m !== mode && setConfirm({ kind: "mode", mode: m })}
        options={[
          {
            value: "smart",
            label: MODE_LABEL.smart,
            icon: BrainCircuit,
            disabled: !canControl || busy,
          },
          { value: "manual", label: MODE_LABEL.manual, icon: Hand, disabled: !canControl || busy },
        ]}
      />
      {!isAdmin && <p className="mt-2 text-[11px] text-muted">صلاحية المشاهد: عرض فقط.</p>}
      {isAdmin && link !== "live" && (
        <p className="mt-2 text-[11px] text-muted">التحكم متاح فقط أثناء اتصال البورد.</p>
      )}
      <CommandProgress state={state} onDismiss={reset} />

      {mode !== "manual" ? (
        <PrioritySection priority={priority} applied={settingsApplied} editable={isAdmin} />
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {SOURCE_ORDER.map((id) => {
            const r = status?.sources?.[id];
            const isActive = status?.active_source === id && status?.system_state !== "no_source";
            const usable = isSelectable(r);
            const reason = isActive ? "فعّال" : usable ? "متاح" : sourceBadge(r, false).label;
            return (
              <button
                key={id}
                type="button"
                disabled={!canControl || busy || isActive || !usable}
                onClick={() => setConfirm({ kind: "source", source: id })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition disabled:cursor-not-allowed",
                  isActive
                    ? "border-ok bg-ok-soft/60 ring-2 ring-ok/20"
                    : "border-line bg-white enabled:hover:border-brand-200",
                  !usable && !isActive && "border-dashed opacity-70",
                )}
              >
                <SourceIcon source={id} size="sm" muted={!usable && !isActive} />
                <span className="text-[12px] font-semibold text-ink">{SOURCE_META[id].short}</span>
                <span
                  className={cn(
                    "text-center text-[10px] font-semibold",
                    isActive ? "text-ok-strong" : usable ? "text-muted" : "text-danger",
                  )}
                >
                  {reason}
                </span>
                {!usable && !isActive && r?.v !== null && r?.v !== undefined && (
                  <span className="num text-[10px] text-faint" dir="ltr">
                    {fmtNum(r.v)} V
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ConfirmSheet
        open={confirm?.kind === "mode"}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === "mode" && confirm.mode === "smart"
            ? "التحويل إلى الوضع الذكي"
            : "التحويل إلى الوضع اليدوي"
        }
        confirmLabel="تأكيد"
        onConfirm={() => {
          if (confirm?.kind === "mode") void send("set_mode", { mode: confirm.mode });
          setConfirm(null);
        }}
      >
        {confirm?.kind === "mode" && confirm.mode === "smart" ? (
          <div className="space-y-3 text-[13px] leading-6 text-ink-2">
            {prediction && prediction !== status?.active_source ? (
              <p className="rounded-2xl border border-warn/30 bg-warn-soft p-3 font-semibold text-warn-strong">
                سيتم التحويل إلى {SOURCE_META[prediction].name} فوراً، لأنه المصدر الأعلى أولوية المتاح
                حالياً (مع مراعاة شروط التحويل الآمن في البورد).
              </p>
            ) : prediction ? (
              <p className="rounded-2xl bg-canvas p-3">
                سيبقى النظام على {SOURCE_META[prediction].name} لأنه الأعلى أولوية المتاح.
              </p>
            ) : (
              <p className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-danger-strong">
                لا يوجد مصدر مؤهَّل حالياً. سينتقل البورد إلى أول مصدر يصبح صالحاً حسب الأولوية.
              </p>
            )}
            <p>الترتيب الحالي: {priority.map((p) => SOURCE_META[p].short).join(" ← ")}</p>
          </div>
        ) : (
          <p className="text-[13px] leading-6 text-ink-2">
            سيحتفظ البورد بالمصدر الحالي ولن ينتقل حسب الأولوية. الحماية تبقى فعّالة: إذا خرج المصدر
            المختار عن حدود التشغيل سينقل البورد الحمل وسيُعرض لك تنبيه بذلك.
          </p>
        )}
      </ConfirmSheet>

      <ConfirmSheet
        open={confirm?.kind === "source"}
        onClose={() => setConfirm(null)}
        title="تأكيد التحويل اليدوي"
        confirmLabel="تأكيد التحويل"
        onConfirm={() => {
          if (confirm?.kind === "source") void send("set_source", { source: confirm.source });
          setConfirm(null);
        }}
      >
        {confirm?.kind === "source" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4 rounded-2xl bg-canvas py-5">
              {status?.active_source ? (
                <SourceIcon source={status.active_source} size="lg" />
              ) : null}
              <span className="text-xl text-faint">←</span>
              <SourceIcon source={confirm.source} size="lg" />
            </div>
            <ul className="space-y-2 rounded-2xl border border-line p-4 text-[12px] leading-6 text-muted">
              <li className="flex gap-2">
                <Zap className="mt-1 size-3.5 shrink-0 text-brand-500" />
                يفصل البورد المصدر الحالي ويتأكد من فتحه، ثم ينتظر مهلة الأمان (
                {settings ? `${fmtNum(settings.neutral_delay_ms / 1000, 1)} ث` : "حسب الإعدادات"})
                قبل توصيل المصدر الجديد.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-1 size-3.5 shrink-0 text-ok" />
                يتحقق البورد من جهد وتردد المصدر ويرفض الأمر إذا كان خارج الحدود المضبوطة.
              </li>
              {confirm.source === "generator" &&
                status?.sources?.generator?.reason === "standby" && (
                  <li className="flex gap-2">
                    <Zap className="mt-1 size-3.5 shrink-0 text-gen" />
                    المولد متوقف: سيشغّله البورد ({settings?.gen_crank_attempts ?? "—"} محاولات كحد
                    أقصى) وينتظر زمن الإحماء ({settings ? `${settings.gen_warmup_s} ث` : "—"}) قبل
                    نقل الحمل، لذلك قد يستغرق التنفيذ وقتاً أطول.
                  </li>
                )}
            </ul>
          </div>
        )}
      </ConfirmSheet>
    </Card>
  );
}

function PrioritySection({
  priority,
  applied,
  editable,
}: {
  priority: SourceId[];
  applied: boolean;
  editable: boolean;
}) {
  const { device, link } = useActiveDevice();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<SourceId[] | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? priority;
  const dirty = draft !== null && draft.join() !== priority.join();

  const save = async () => {
    if (!device || !draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("device_settings")
      .update({ priority: draft })
      .eq("device_id", device.id);
    setSaving(false);
    if (error)
      return pushToast({ kind: "error", title: "تعذر حفظ الترتيب", body: errorMessage(error) });
    setDraft(null);
    pushToast({ kind: "info", title: "تم حفظ ترتيب الأولوية", body: "سيُطبَّق بعد تأكيد البورد." });
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-bold text-ink">ترتيب أولوية المصادر</p>
        {!dirty && link !== "never" && (
          <span
            className={cn(
              "text-[11px] font-semibold",
              applied ? "text-ok-strong" : "text-warn-strong",
            )}
          >
            {applied ? "مطبَّق على البورد" : "بانتظار تأكيد البورد"}
          </span>
        )}
      </div>
      <PriorityList value={value} onChange={setDraft} disabled={!editable || saving} />
      <p className="mt-2 text-[11px] leading-5 text-muted">
        {editable ? "اسحب المصادر لإعادة ترتيبها. " : ""}يعتمد البورد على المصدر الأول إذا كان مستوفياً
        لشروط التشغيل، وإلا ينتقل إلى التالي، ويعود إلى الأعلى أولوية بعد استقراره.
      </p>
      {dirty && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" loading={saving} onClick={save}>
            حفظ الترتيب
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setDraft(null)}>
            تراجع
          </Button>
        </div>
      )}
    </div>
  );
}

function TodayStats() {
  const { device, settings, serverNow, link } = useActiveDevice();
  const tz = settings?.timezone ?? "UTC";
  const now = useNow(60_000);
  const dayStart = useMemo(() => startOfDayInTz(serverNow(), tz), [tz, now, serverNow]);
  const energy = useEnergy(device?.id ?? null, dayStart);
  const transfers = useEvents(device?.id ?? null, ["transfer_completed"], dayStart);
  const kwh = energy.data.reduce((a, r) => a + r.wh, 0) / 1000;
  const loading = energy.loading || transfers.loading;
  const hasEnergy = energy.data.length > 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-3.5">
        <p className="flex items-center justify-between text-[11px] text-muted">
          استهلاك اليوم
          <InfoHint text="مجموع الطاقة المسجلة بعدادات البورد لكل المصادر منذ منتصف الليل بتوقيت الجهاز." />
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
            {link === "never" ? "لا توجد بيانات" : "لا يوجد استهلاك مسجل"}
          </p>
        )}
      </Card>
      <Card className="p-3.5">
        <p className="flex items-center justify-between text-[11px] text-muted">
          تحويلات اليوم
          <InfoHint text="عدد عمليات التحويل الناجحة منذ منتصف الليل. المحاولات الفاشلة لا تُحتسب وتظهر في السجل." />
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-12" />
        ) : (
          <p className="num mt-1 text-[22px] leading-tight font-bold text-ink">
            {transfers.data.length}{" "}
            <span className="text-[11px] font-medium text-muted">عملية</span>
          </p>
        )}
      </Card>
    </div>
  );
}

function SourcesCard() {
  const { status, link } = useActiveDevice();
  const live = link === "live" || link === "stale";
  const noSource = status?.system_state === "no_source";
  const visible = SOURCE_ORDER.filter((id) => {
    const r = status?.sources?.[id];
    if (!r || r.reason === "not_installed") return false;
    if (noSource) return true; // A1: show every source with its reason
    const isActive = status?.active_source === id;
    return (
      isActive || r.available || r.qualified || r.reason === "qualifying" || r.reason === "standby"
    );
  });

  return (
    <div>
      <SectionTitle title="حالة مصادر الطاقة" />
      <Card className="divide-y divide-line">
        {!live ? (
          <p className="p-4 text-center text-[13px] text-muted">
            {link === "never"
              ? "لا توجد بيانات حالياً."
              : "حالة المصادر غير معروفة أثناء انقطاع الاتصال بالبورد."}
          </p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-muted">لا توجد مصادر متاحة حالياً.</p>
        ) : (
          visible.map((id) => {
            const r = status?.sources?.[id];
            const isActive = status?.active_source === id && !noSource;
            const b = sourceBadge(r, isActive);
            return (
              <div key={id} className="flex items-center gap-3 p-4">
                <SourceIcon source={id} muted={!isActive && !r?.qualified} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{SOURCE_META[id].name}</p>
                  <p
                    className="num text-[12px] text-muted"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {fmtVf(r)}
                  </p>
                </div>
                <Badge tone={b.tone} dot pulse={isActive}>
                  {b.label}
                </Badge>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

function SignalBars({ rssi, on }: { rssi: number | null; on: boolean }) {
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

function ConnectionCard() {
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

function DeviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { memberships, activeId, setActiveId, clockOffsetMs } = useDevices();
  const { push } = useNav();
  const [statuses, setStatuses] = useState<
    Record<string, Pick<DeviceStatus, "online" | "last_seen_at" | "interval_ms">>
  >({});

  useEffect(() => {
    if (!open || !memberships.length) return;
    void supabase
      .from("device_status")
      .select("device_id, online, last_seen_at, interval_ms")
      .in(
        "device_id",
        memberships.map((m) => m.device.id),
      )
      .then(({ data }) => {
        const map: typeof statuses = {};
        for (const row of (data ?? []) as (DeviceStatus & { device_id: string })[])
          map[row.device_id] = row;
        setStatuses(map);
      });
  }, [open, memberships]);

  return (
    <Sheet open={open} onClose={onClose} title="أجهزتي">
      <div className="space-y-2">
        {memberships.map((m) => {
          const selected = m.device.id === activeId;
          const s = statuses[m.device.id];
          const seen = s?.last_seen_at ? Date.parse(s.last_seen_at) : null;
          const online = Boolean(s?.online && seen && Date.now() + clockOffsetMs - seen < 30_000);
          return (
            <button
              key={m.device.id}
              type="button"
              onClick={() => {
                setActiveId(m.device.id);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition",
                selected ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-200",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-2xl",
                  online ? "bg-ok-soft text-ok" : "bg-canvas text-faint",
                )}
              >
                <Router className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {m.device.name || m.device.id}
                </span>
                <span className="num block text-[11px] text-muted">
                  <span dir="ltr">{m.device.id}</span> •{" "}
                  {!s
                    ? "…"
                    : online
                      ? "متصل"
                      : seen
                        ? `غير متصل • ${fmtAgo(seen, Date.now() + clockOffsetMs)}`
                        : "لم يتصل بعد"}
                </span>
              </span>
              <StatusDot tone={online ? "ok" : "danger"} />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-3">
        <Button
          full
          icon={Plus}
          onClick={() => {
            onClose();
            push("addDevice");
          }}
        >
          إضافة جهاز
        </Button>
        <Button
          full
          variant="secondary"
          onClick={() => {
            onClose();
            push("devices");
          }}
        >
          إدارة الأجهزة
        </Button>
      </div>
    </Sheet>
  );
}
