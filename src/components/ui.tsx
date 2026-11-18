import {
  ChevronRight,
  Eye,
  EyeOff,
  Fuel,
  LoaderCircle,
  Sun,
  UtilityPole,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SOURCE_META } from "../data/meta";
import type { SourceId } from "../data/types";
import { cn } from "../lib/cn";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand";

const TONE: Record<Tone, { text: string; bg: string; dot: string }> = {
  ok: { text: "text-ok-strong", bg: "bg-ok-soft", dot: "bg-ok" },
  warn: { text: "text-warn-strong", bg: "bg-warn-soft", dot: "bg-warn" },
  danger: { text: "text-danger-strong", bg: "bg-danger-soft", dot: "bg-danger" },
  info: { text: "text-brand-700", bg: "bg-brand-100", dot: "bg-brand-500" },
  brand: { text: "text-white", bg: "bg-brand-800", dot: "bg-white" },
  neutral: { text: "text-ink-2", bg: "bg-canvas", dot: "bg-faint" },
};

export const toneText = (t: Tone) => TONE[t].text;
export const toneBg = (t: Tone) => TONE[t].bg;
export const toneDot = (t: Tone) => TONE[t].dot;

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const cls = cn("rounded-[22px] border border-line/80 bg-white card-shadow", className);
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          cls,
          "block w-full text-start transition active:scale-[0.99] hover:border-brand-200",
        )}
      >
        {children}
      </button>
    );
  }
  return <div className={cls}>{children}</div>;
}

export function Badge({
  tone = "neutral",
  children,
  dot,
  pulse,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold",
        TONE[tone].text,
        TONE[tone].bg,
        className,
      )}
    >
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      {children}
    </span>
  );
}

export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      {pulse && (
        <span className={cn("absolute inset-0 rounded-full animate-pulse-ring", TONE[tone].dot)} />
      )}
      <span className={cn("relative size-2 rounded-full", TONE[tone].dot)} />
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "md" | "sm" | "lg";
  loading?: boolean;
  icon?: LucideIcon;
  full?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon: Icon,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        "disabled:opacity-50 active:scale-[0.98]",
        size === "lg" && "h-14 rounded-2xl px-6 text-[15px]",
        size === "md" && "h-12 rounded-2xl px-5 text-sm",
        size === "sm" && "h-9 rounded-xl px-3.5 text-[13px]",
        variant === "primary" &&
          "bg-brand-800 text-white shadow-[0_8px_20px_-8px_rgba(15,45,87,0.7)] hover:bg-brand-700",
        variant === "secondary" && "bg-brand-50 text-brand-800 hover:bg-brand-100",
        variant === "outline" && "border border-line bg-white text-ink hover:border-brand-200",
        variant === "ghost" && "text-brand-700 hover:bg-brand-50",
        variant === "danger" && "bg-danger-soft text-danger-strong hover:bg-[#fbdcd9]",
        full && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        Icon && <Icon className="size-[18px]" />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  badge,
  className,
  tone = "light",
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  badge?: number;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-95",
        tone === "light"
          ? "border border-line bg-white text-ink-2 hover:border-brand-200 hover:text-brand-700"
          : "bg-white/10 text-white hover:bg-white/15",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={1.8} />
      {badge ? (
        <span className="num absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-canvas">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
  ltr?: boolean;
};

export function Field({
  label,
  icon: Icon,
  error,
  hint,
  ltr,
  type,
  className,
  id,
  ...rest
}: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputId = id ?? `f-${label}`;
  return (
    <label htmlFor={inputId} className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      <span className="relative block">
        {Icon && (
          <Icon className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-faint" />
        )}
        <input
          id={inputId}
          type={isPassword && show ? "text" : type}
          dir={ltr ? "ltr" : undefined}
          className={cn(
            "h-12 w-full rounded-2xl border bg-white text-[15px] text-ink outline-none transition placeholder:text-faint",
            "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10",
            Icon ? "pr-11" : "pr-4",
            isPassword ? "pl-11" : "pl-4",
            ltr && "text-right placeholder:text-right",
            error ? "border-danger" : "border-line",
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            className="absolute top-1/2 left-3 -translate-y-1/2 rounded-lg p-1 text-faint hover:text-ink-2"
          >
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        )}
      </span>
      {error ? (
        <span className="mt-1.5 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-ok" : "bg-[#d0d6e2]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 right-0.5 size-6 rounded-full bg-white shadow-sm transition-transform",
          checked && "-translate-x-5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  dark,
}: {
  options: { value: T; label: string; icon?: LucideIcon; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 rounded-2xl p-1", dark ? "bg-white/10" : "bg-[#e9eef6]", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition disabled:opacity-40",
              active
                ? dark
                  ? "bg-white text-brand-900 shadow"
                  : "bg-white text-ink shadow-[0_1px_3px_rgba(16,24,40,0.12)]"
                : dark
                  ? "text-white/70 hover:text-white"
                  : "text-muted hover:text-ink-2",
            )}
          >
            {o.icon && <o.icon className="size-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition",
              active
                ? "border-brand-800 bg-brand-800 text-white"
                : "border-line bg-white text-ink-2 hover:border-brand-200",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  "num rounded-full px-1.5 text-[11px]",
                  active ? "bg-white/20 text-white" : "bg-canvas text-muted",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const host = document.getElementById("sheet-root");
  const node = (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-brand-950/45 backdrop-blur-[2px]"
      />
      <div className="relative flex max-h-[88%] animate-sheet-in flex-col rounded-t-[28px] bg-white">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <h2 className="text-[17px] font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="flex size-9 items-center justify-center rounded-xl bg-canvas text-muted hover:text-ink"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-6">{footer}</div>}
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 bg-canvas/90 px-5 pt-4 pb-3 backdrop-blur-md">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="رجوع"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-white text-ink-2 transition hover:text-brand-700 active:scale-95"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="text-[15px] font-bold text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function TextAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-semibold text-brand-600 hover:text-brand-700"
    >
      {children}
    </button>
  );
}

export const SOURCE_ICON: Record<SourceId, LucideIcon> = {
  grid: UtilityPole,
  solar: Sun,
  generator: Fuel,
};

export function SourceIcon({
  source,
  size = "md",
  muted,
  className,
}: {
  source: SourceId;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
  className?: string;
}) {
  const Icon = SOURCE_ICON[source];
  const m = SOURCE_META[source];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "sm" && "size-8 rounded-xl",
        size === "md" && "size-10 rounded-2xl",
        size === "lg" && "size-14 rounded-[20px]",
        className,
      )}
      style={{ background: muted ? "#eef1f6" : m.soft, color: muted ? "#98a2b3" : m.color }}
    >
      <Icon
        className={cn(size === "sm" ? "size-4" : size === "md" ? "size-5" : "size-7")}
        strokeWidth={1.9}
      />
    </span>
  );
}

export function ProgressBar({
  value,
  color,
  className,
}: {
  value: number;
  color: string;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-[#e9eef6]", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600">
        <Icon className="size-7" strokeWidth={1.7} />
      </span>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[260px] text-[13px] leading-6 text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Row({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  right,
  onClick,
  chevron = true,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-canvas/60"
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700",
          iconClass,
        )}
      >
        <Icon className="size-[19px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-muted">{subtitle}</span>}
      </span>
      {right}
      {chevron && <ChevronRight className="size-[18px] shrink-0 rotate-180 text-faint" />}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-xl bg-[#e6ebf3]", className)} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3">
      <p className="text-[13px] font-semibold text-danger-strong">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1.5 text-[12px] font-bold text-danger-strong underline"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

/** Small "؟" toggle that reveals how a metric is defined (C5). */
export function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="تعريف المقياس"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-5 items-center justify-center rounded-full bg-canvas text-[11px] font-bold text-muted hover:text-ink"
      >
        ؟
      </button>
      {open && (
        <span className="absolute top-6 right-0 z-10 w-52 rounded-xl border border-line bg-white p-2.5 text-[11px] leading-5 font-normal text-ink-2 shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  danger,
  loading,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button
            full
            loading={loading}
            disabled={disabled}
            onClick={onConfirm}
            className={
              danger ? "bg-danger text-white shadow-none hover:bg-danger-strong" : undefined
            }
          >
            {confirmLabel}
          </Button>
          <Button full variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      {children}
    </Sheet>
  );
}
