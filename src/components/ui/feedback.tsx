import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { t } from "../../i18n";

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

/**
 * Loading placeholder. It appears only if loading takes longer than 300 ms,
 * so fast answers (and data already in memory) never flash a placeholder.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block rounded-xl bg-skeleton", className)} />;
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
          {t("إعادة المحاولة")}
        </button>
      )}
    </div>
  );
}
