import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
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
            "h-12 w-full rounded-2xl border bg-surface text-[15px] text-ink outline-none transition placeholder:text-faint",
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
        checked ? "bg-ok" : "bg-toggle-off",
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
      className={cn("flex gap-1 rounded-2xl p-1", dark ? "bg-white/10" : "bg-track", className)}
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
                  ? "bg-white text-[#0a1f3d] shadow"
                  : "bg-surface text-ink shadow-[0_1px_3px_rgba(16,24,40,0.12)]"
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
                : "border-line bg-surface text-ink-2 hover:border-brand-200",
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
