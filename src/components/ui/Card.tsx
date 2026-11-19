import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const cls = cn("rounded-[22px] border border-line/80 bg-surface card-shadow", className);
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
