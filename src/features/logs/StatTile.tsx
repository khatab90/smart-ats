import type { LucideIcon } from "lucide-react";
import { Card, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A number with its icon, name and a short plain-language note (no pop-up hints). */
export function StatTile({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  note: string;
  tone?: "danger";
}) {
  return (
    <Card className="flex flex-col p-3.5">
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-50 text-brand-600",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      {value === null ? (
        <Skeleton className="mt-3 h-7 w-16" />
      ) : (
        <p
          className={cn(
            "num mt-3 text-[22px] leading-none font-bold",
            tone === "danger" ? "text-danger" : "text-ink",
          )}
        >
          {value}
        </p>
      )}
      <p className="mt-2 text-[13px] leading-5 font-semibold text-ink-2">{label}</p>
      <p className="text-[11px] text-muted">{note}</p>
    </Card>
  );
}
