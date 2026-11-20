import { CircleCheck, CircleX, LoaderCircle, TimerOff, X } from "lucide-react";
import { PHASE_LABEL, type CommandState } from "../hooks/useCommand";
import { cn } from "../lib/cn";
import { t } from "../i18n";

/** Inline lifecycle of the last command (A8). */
export function CommandProgress({
  state,
  onDismiss,
}: {
  state: CommandState;
  onDismiss: () => void;
}) {
  if (state.phase === "idle") return null;
  const done = state.phase === "completed";
  const bad = ["rejected", "failed", "expired", "error"].includes(state.phase);
  const timeout = state.phase === "timeout";
  // Success hides itself (useCommand); only problems need a close button.
  const dismissable = bad || timeout;
  return (
    <div
      role="status"
      className={cn(
        "mt-3 flex animate-fade-in items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[12px]",
        done
          ? "bg-ok-soft text-ok-strong"
          : bad
            ? "bg-danger-soft text-danger-strong"
            : timeout
              ? "bg-warn-soft text-warn-strong"
              : "bg-brand-50 text-brand-800",
      )}
    >
      {done ? (
        <CircleCheck className="size-4 shrink-0" />
      ) : bad ? (
        <CircleX className="size-4 shrink-0" />
      ) : timeout ? (
        <TimerOff className="size-4 shrink-0" />
      ) : (
        <LoaderCircle className="size-4 shrink-0 animate-spin" />
      )}
      <span className="flex-1 leading-5">
        <span className="font-semibold">{PHASE_LABEL[state.phase]}</span>
        {state.message && <span className="block opacity-90">{state.message}</span>}
        {timeout && (
          <span className="block opacity-90">{t("تحقق من حالة النظام قبل إعادة المحاولة.")}</span>
        )}
      </span>
      {dismissable && (
        <button
          type="button"
          aria-label={t("إخفاء")}
          onClick={onDismiss}
          className="rounded-lg p-0.5 opacity-70 hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
