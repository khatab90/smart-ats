import {
  Activity,
  BatteryFull,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  History,
  House,
  LayoutGrid,
  Signal,
  Wifi,
  WifiOff,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { fmtTime } from "../lib/format";
import { useNow } from "../store/devices";
import { useNav, type Tab } from "../store/nav";
import { useToast, type Toast } from "../store/toast";

export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[30%] bg-brand-800",
        className,
      )}
      style={{ width: size, height: size, background: "linear-gradient(145deg,#1d5bc4,#0a1f3d)" }}
    >
      <svg viewBox="0 0 32 32" style={{ width: size * 0.62, height: size * 0.62 }} fill="none">
        <path
          d="M6 9h9M6 16h6M6 23h9"
          stroke="rgba(255,255,255,.45)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M15 9c4 0 4 7 8 7M12 16h11M15 23c4 0 4-7 8-7"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="25" cy="16" r="3" fill="#12b76a" />
      </svg>
    </span>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-16 bg-[radial-gradient(120%_80%_at_80%_0%,#c9dcfb_0%,#dfe6f1_45%,#d4dcea_100%)] dark:bg-[radial-gradient(120%_80%_at_80%_0%,#13233f_0%,#0b1220_45%,#060b14_100%)] sm:p-6">
      <aside className="hidden max-w-[300px] lg:block" dir="rtl">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <div>
            <p className="text-2xl font-bold tracking-tight text-brand-900">Smart ATS</p>
            <p className="text-sm text-muted">نظام التحويل التلقائي الذكي</p>
          </div>
        </div>
        <p className="mt-6 text-[15px] leading-8 text-ink-2">
          مراقبة وتحكم بمفتاح التحويل التلقائي. القراءات والحالات تأتي من بورد ESP32 فقط، وتُخزَّن في
          Supabase.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-[12px] font-semibold">
          <span className="rounded-full bg-surface/70 px-3 py-1.5 text-grid">الشبكة الوطنية</span>
          <span className="rounded-full bg-surface/70 px-3 py-1.5 text-solar">الطاقة الشمسية</span>
          <span className="rounded-full bg-surface/70 px-3 py-1.5 text-gen">المولد</span>
        </div>
      </aside>
      <div
        dir="rtl"
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:h-[min(880px,calc(100dvh-48px))] sm:max-w-[400px] sm:rounded-[46px] sm:phone-shadow"
      >
        <StatusBar />
        <div className="relative min-h-0 flex-1">{children}</div>
        <div id="sheet-root" className="pointer-events-none absolute inset-0 z-50" />
      </div>
    </div>
  );
}

function StatusBar() {
  const now = useNow(30_000);
  return (
    <div
      className="hidden h-11 shrink-0 items-center justify-between bg-transparent px-7 pt-1 text-[13px] font-semibold text-ink sm:flex"
      dir="ltr"
    >
      <span className="num">{fmtTime(now).replace(/[^\d:]/g, "")}</span>
      <span className="flex items-center gap-1.5">
        <Signal className="size-3.5" strokeWidth={2.5} />
        <Wifi className="size-3.5" strokeWidth={2.5} />
        <BatteryFull className="size-[18px]" strokeWidth={2} />
      </span>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "الرئيسية", icon: House },
  { id: "live", label: "المراقبة", icon: Activity },
  { id: "energy", label: "الطاقة", icon: ChartColumn },
  { id: "logs", label: "السجل", icon: History },
  { id: "more", label: "المزيد", icon: LayoutGrid },
];

export function BottomNav() {
  const { tab, setTab } = useNav();
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="absolute inset-x-3 bottom-3 z-30 flex rounded-[26px] border border-line/80 bg-surface/95 p-1.5 shadow-[0_12px_32px_-12px_rgba(10,31,61,0.35)] backdrop-blur-md"
    >
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-1 rounded-[20px] py-1.5 transition"
          >
            <span
              className={cn(
                "flex h-8 w-12 items-center justify-center rounded-full transition",
                active ? "bg-brand-800 text-white" : "text-faint",
              )}
            >
              <t.icon className="size-[19px]" strokeWidth={active ? 2.1 : 1.8} />
            </span>
            <span
              className={cn("text-[11px] font-semibold", active ? "text-brand-800" : "text-muted")}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

const TOAST_ICON: Record<Toast["kind"], { icon: LucideIcon; cls: string }> = {
  source_outage: { icon: ZapOff, cls: "bg-danger-soft text-danger" },
  transfer: { icon: Zap, cls: "bg-brand-100 text-brand-600" },
  electrical_fault: { icon: CircleAlert, cls: "bg-warn-soft text-warn" },
  connection_lost: { icon: WifiOff, cls: "bg-canvas text-ink-2" },
  transfer_failed: { icon: CircleAlert, cls: "bg-danger-soft text-danger" },
  info: { icon: Zap, cls: "bg-brand-100 text-brand-600" },
  success: { icon: CircleCheck, cls: "bg-ok-soft text-ok" },
  error: { icon: CircleAlert, cls: "bg-danger-soft text-danger" },
};

export function ToastHost() {
  const { toasts, dismissToast } = useToast();
  return (
    <div
      className="pointer-events-none absolute inset-x-3 top-3 z-[60] flex flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const meta = TOAST_ICON[t.kind];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-[20px] border border-line/70 bg-surface/95 p-3 text-start shadow-[0_16px_36px_-14px_rgba(10,31,61,0.4)] backdrop-blur"
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                meta.cls,
              )}
            >
              <meta.icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block text-[13px] font-bold text-ink">{t.title}</span>
              {t.body && (
                <span className="mt-0.5 block text-[12px] leading-5 text-muted">{t.body}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
