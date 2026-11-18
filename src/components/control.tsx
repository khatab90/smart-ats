import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  GripVertical,
  LoaderCircle,
  TimerOff,
  X,
} from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SOURCE_META } from "../data/meta";
import type { SourceId } from "../data/types";
import { PHASE_LABEL, type CommandState } from "../hooks/useCommand";
import { cn } from "../lib/cn";
import { movePriority } from "../domain/sources";
import { SourceIcon } from "./ui";

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
  const terminal = done || bad || timeout;
  return (
    <div
      role="status"
      className={cn(
        "mt-3 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[12px]",
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
          <span className="block opacity-90">تحقق من حالة النظام قبل إعادة المحاولة.</span>
        )}
      </span>
      {terminal && (
        <button
          type="button"
          aria-label="إخفاء"
          onClick={onDismiss}
          className="rounded-lg p-0.5 opacity-70 hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Drag-and-drop priority list (pointer events work for mouse and touch),
 * with arrow buttons as an accessible alternative.
 */
export function PriorityList({
  value,
  onChange,
  disabled,
}: {
  value: SourceId[];
  onChange: (next: SourceId[]) => void;
  disabled?: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ index: number; over: number } | null>(null);

  const indexAt = (clientY: number) => {
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length - 1;
  };

  const onPointerDown = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index: i, over: i });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const over = indexAt(e.clientY);
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const onPointerUp = () => {
    if (drag && drag.over !== drag.index) onChange(movePriority(value, drag.index, drag.over));
    setDrag(null);
  };

  const preview = drag ? movePriority(value, drag.index, drag.over) : value;

  return (
    <ol ref={listRef} className="space-y-2" aria-label="ترتيب أولوية المصادر">
      {preview.map((id, i) => {
        const dragging = drag !== null && value[drag.index] === id;
        return (
          <li
            key={id}
            className={cn(
              "flex items-center gap-2.5 rounded-2xl border bg-white px-2.5 py-2 transition-shadow",
              dragging ? "border-brand-400 shadow-lg" : "border-line",
            )}
          >
            <button
              type="button"
              aria-label={`اسحب لإعادة ترتيب ${SOURCE_META[id].name}`}
              disabled={disabled}
              onPointerDown={onPointerDown(value.indexOf(id))}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
              className="touch-none cursor-grab rounded-lg p-1 text-faint active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GripVertical className="size-5" />
            </button>
            <span className="num flex size-6 items-center justify-center rounded-full bg-canvas text-[12px] font-bold text-ink-2">
              {i + 1}
            </span>
            <SourceIcon source={id} size="sm" />
            <span className="flex-1 text-[13px] font-semibold text-ink">
              {SOURCE_META[id].name}
            </span>
            <span className="flex">
              <button
                type="button"
                aria-label={`رفع أولوية ${SOURCE_META[id].name}`}
                disabled={disabled || i === 0}
                onClick={() => onChange(movePriority(value, i, i - 1))}
                className="rounded-lg p-1.5 text-muted hover:bg-canvas disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`خفض أولوية ${SOURCE_META[id].name}`}
                disabled={disabled || i === preview.length - 1}
                onClick={() => onChange(movePriority(value, i, i + 1))}
                className="rounded-lg p-1.5 text-muted hover:bg-canvas disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
