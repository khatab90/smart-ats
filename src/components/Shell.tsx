import {
  Activity,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  History,
  House,
  LayoutGrid,
  WifiOff,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { useNav, type Tab } from "../store/nav";
import { useToast, type Toast } from "../store/toast";
import { t, textDir } from "../i18n";

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

/**
 * The app fills the whole screen on every device: phones (portrait or
 * landscape), foldables and tablets.
 * Sheets and dialogs mount in #sheet-root, above everything.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div dir={textDir()} className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas">
      {/* Keeps content clear of the status bar and the navigation bar. */}
      <div className="relative min-h-0 flex-1 pt-safe pb-safe">{children}</div>
      <div id="sheet-root" className="pointer-events-none absolute inset-0 z-50" />
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: t("الرئيسية"), icon: House },
  { id: "live", label: t("المراقبة"), icon: Activity },
  { id: "energy", label: t("الطاقة"), icon: ChartColumn },
  { id: "logs", label: t("السجل"), icon: History },
  { id: "more", label: t("المزيد"), icon: LayoutGrid },
];

export function BottomNav() {
  const { tab, setTab } = useNav();
  return (
    <nav
      aria-label={t("التنقل الرئيسي")}
      className="absolute inset-x-3 bottom-3 z-30 flex rounded-[26px] md:hidden border border-line/80 bg-surface/95 p-1.5 shadow-[0_12px_32px_-12px_rgba(10,31,61,0.35)] backdrop-blur-md"
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

/**
 * Phones in landscape and tablets: a rail of icons with short labels.
 * Large tablets in landscape (lg): a sidebar with the app name, full labels
 * and the signed-in user. Short screens get a compact rail.
 */
export function SideNav({ footer }: { footer?: ReactNode }) {
  const { tab, setTab } = useNav();
  return (
    <nav
      aria-label={t("التنقل الرئيسي")}
      className="no-scrollbar hidden w-[92px] shrink-0 flex-col overflow-y-auto border-e border-line bg-surface px-3 pt-6 pb-4 md:flex lg:w-[260px] lg:px-4 short:w-[76px] short:pt-3 short:pb-3"
    >
      <div className="flex items-center justify-center gap-3 lg:justify-start lg:px-2">
        <Logo size={42} className="short:hidden" />
        <div className="hidden min-w-0 lg:block short:hidden">
          <p className="text-[17px] leading-tight font-bold tracking-tight text-ink" dir="ltr">
            Smart ATS
          </p>
          <p className="text-[11px] leading-4 text-muted">{t("نظام التحويل التلقائي الذكي")}</p>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-1.5 short:mt-0 short:gap-1">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 transition lg:flex-row lg:gap-3 lg:px-3.5 lg:py-3 short:py-1.5 short:lg:flex-col short:lg:gap-0.5 short:lg:px-2 short:lg:py-1.5",
                active
                  ? "bg-brand-800 text-white shadow-[0_8px_20px_-10px_rgba(10,31,61,0.7)]"
                  : "text-muted hover:bg-canvas hover:text-ink",
              )}
            >
              <item.icon className="size-5 shrink-0" strokeWidth={active ? 2.1 : 1.8} />
              <span className="text-[11px] font-semibold lg:text-[14px] short:text-[10px] short:lg:text-[10px]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      {footer && <div className="mt-auto pt-3 short:hidden">{footer}</div>}
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
      className="pointer-events-none absolute inset-x-3 top-3 z-[60] flex flex-col gap-2 md:inset-x-auto md:end-6 md:top-6 md:w-[380px]"
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
