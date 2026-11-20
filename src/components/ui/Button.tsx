import { LoaderCircle, type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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
        variant === "outline" && "border border-line bg-surface text-ink hover:border-brand-200",
        variant === "ghost" && "text-brand-700 hover:bg-brand-50",
        variant === "danger" && "bg-danger-soft text-danger-strong hover:bg-danger-soft/70",
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
          ? "border border-line bg-surface text-ink-2 hover:border-brand-200 hover:text-brand-700"
          : "bg-white/10 text-white hover:bg-white/15",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={1.8} />
      {badge ? (
        <span
          dir="ltr"
          className="num absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-canvas"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  );
}
