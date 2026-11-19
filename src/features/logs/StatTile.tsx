import { Card, InfoHint, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { uiStart } from "../../i18n";

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | null;
  hint: string;
  tone?: "danger";
}) {
  return (
    <Card className="p-3">
      <p className="flex items-center justify-between gap-1 text-[11px] text-muted">
        <span className="truncate">{label}</span>
        <InfoHint text={hint} />
      </p>
      {value === null ? (
        <Skeleton className="mt-2 h-6 w-14" />
      ) : (
        <p
          className={cn(
            "num mt-1 text-[18px] font-bold",
            tone === "danger" ? "text-danger" : "text-ink",
          )}
          dir="ltr"
          style={{ textAlign: uiStart() }}
        >
          {value}
        </p>
      )}
    </Card>
  );
}
