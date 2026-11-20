import { ArrowDown, Check, ListRestart, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Button, Card, SourceIcon } from "../../components/ui";
import { SOURCE_META } from "../../data/meta";
import type { SourceId } from "../../data/types";
import { cn } from "../../lib/cn";
import { t } from "../../i18n";

const ORDINAL = [t("الأول"), t("الثاني"), t("الثالث")];

/** The stored order always holds all three sources; uninstalled ones keep their place at the end. */
export function withUninstalled(
  order: SourceId[],
  full: SourceId[],
  installed: SourceId[],
): SourceId[] {
  return [...order, ...full.filter((s) => !installed.includes(s))];
}

/**
 * Source priority as a plain chain ("uses the grid; if it is lost, solar…").
 * To change it, the user taps the sources in the order they want; the last
 * one is placed by itself. No dragging, no arrows.
 */
export function PriorityPicker({
  value,
  installed,
  onChange,
  disabled,
}: {
  value: SourceId[];
  installed: SourceId[];
  onChange: (next: SourceId[]) => void;
  disabled?: boolean;
}) {
  const current = value.filter((s) => installed.includes(s));
  const [picking, setPicking] = useState<SourceId[] | null>(null);
  const remaining = picking ? current.filter((s) => !picking.includes(s)) : [];

  const pick = (s: SourceId) => {
    if (!picking) return;
    const next = [...picking, s];
    const left = current.filter((x) => !next.includes(x));
    if (left.length <= 1) {
      onChange(withUninstalled([...next, ...left], value, installed));
      setPicking(null);
    } else setPicking(next);
  };

  if (picking) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-[15px] font-bold text-ink">
            {t("اختر المصدر {0}", { 0: ORDINAL[picking.length] ?? "" })}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {picking.length === 0
              ? t("المصدر الذي يستخدمه البورد أولاً كلما كان متوفراً.")
              : t("يُستخدم إذا لم يتوفر ما قبله.")}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2.5">
            {remaining.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className="flex items-center gap-3 rounded-2xl border-2 border-line bg-surface p-3.5 text-start transition active:scale-[0.98] hover:border-brand-400"
              >
                <SourceIcon source={s} />
                <span className="flex-1 text-[15px] font-semibold text-ink">
                  {SOURCE_META[s].name}
                </span>
              </button>
            ))}
          </div>
        </Card>
        {picking.length > 0 && <Chain order={picking} partial />}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={RotateCcw}
            onClick={() => setPicking([])}
            disabled={!picking.length}
          >
            {t("من البداية")}
          </Button>
          <Button variant="secondary" icon={X} onClick={() => setPicking(null)}>
            {t("إلغاء")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Chain order={current} />
      {!disabled && current.length > 1 && (
        <Button full icon={ListRestart} onClick={() => setPicking([])}>
          {t("تغيير الترتيب")}
        </Button>
      )}
    </div>
  );
}

/** "1 grid → if it is lost → 2 solar → …" */
function Chain({ order, partial }: { order: SourceId[]; partial?: boolean }) {
  return (
    <Card className="p-4">
      <ol>
        {order.map((s, i) => (
          <li key={s}>
            {i > 0 && (
              <p className="flex items-center gap-2 py-1.5 ps-4 text-[12px] text-muted">
                <ArrowDown className="size-4 text-faint" />
                {t("إذا لم يتوفر")}
              </p>
            )}
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                  i === 0 ? "bg-brand-800 text-white" : "bg-track text-ink-2",
                )}
              >
                {i + 1}
              </span>
              <SourceIcon source={s} size="sm" />
              <span className="flex-1 text-[14px] font-semibold text-ink">
                {SOURCE_META[s].name}
              </span>
              {partial && <Check className="size-4 text-ok" />}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
