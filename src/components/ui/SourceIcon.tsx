import { Fuel, Sun, UtilityPole, type LucideIcon } from "lucide-react";
import { SOURCE_META } from "../../data/meta";
import type { SourceId } from "../../data/types";
import { cn } from "../../lib/cn";

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
