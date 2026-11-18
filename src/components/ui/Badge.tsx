import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { TONE, type Tone } from "./tone";

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
