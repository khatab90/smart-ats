import { ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { t } from "../../i18n";

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
          aria-label={t("رجوع")}
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink-2 transition hover:text-brand-700 active:scale-95"
        >
          <ChevronRight className="size-5 ltr:rotate-180" />
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
      {chevron && <ChevronRight className="size-[18px] shrink-0 text-faint rtl:rotate-180" />}
    </button>
  );
}

/** A titled card of Rows, as in a settings list. */
export function RowGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <p className="mb-2 px-1 text-[12px] font-semibold text-muted">{title}</p>}
      <div className="divide-y divide-line overflow-hidden rounded-[22px] border border-line/80 bg-surface card-shadow">
        {children}
      </div>
    </div>
  );
}
