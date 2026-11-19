import { ChevronLeft, Clock3 } from "lucide-react";
import { Fragment } from "react";
import { SourceIcon } from "../../components/ui";
import { SOURCE_META } from "../../data/meta";
import type { SourceId } from "../../data/types";
import { describePeriod } from "../../domain/schedule";
import { installedSources } from "../../domain/sources";
import { cn } from "../../lib/cn";
import { useActiveDevice } from "../../store/devices";
import { useNav } from "../../store/nav";
import { t } from "../../i18n";

/** The priority order, read-only; it is edited in Device settings. */
export function PrioritySection({
  priority,
  applied,
  editable,
}: {
  priority: SourceId[];
  applied: boolean;
  editable: boolean;
}) {
  const { link, status, settings } = useActiveDevice();
  const { push } = useNav();
  const schedule = settings?.solar_schedule;
  const installed = installedSources(status);
  const order = priority.filter((s) => installed.includes(s));

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-ink">{t("ترتيب الأولوية")}</p>
          {link !== "never" && (
            <p
              className={cn(
                "text-[11px] font-medium",
                applied ? "text-ok-strong" : "text-warn-strong",
              )}
            >
              {applied ? t("مطبَّق على البورد") : t("بانتظار تأكيد البورد")}
            </p>
          )}
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => push("settings.priority")}
            className="flex items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-brand-600 hover:bg-brand-50"
          >
            {t("تعديل")}
            <ChevronLeft className="size-4 ltr:rotate-180" />
          </button>
        )}
      </div>
      <ol className="flex items-center gap-1">
        {order.map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <ChevronLeft className="size-3.5 shrink-0 text-faint ltr:rotate-180" />}
            <li className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl bg-canvas px-1 py-2.5">
              <span className="relative">
                <SourceIcon source={s} size="sm" />
                <span className="absolute -end-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full bg-brand-800 text-[10px] font-bold text-white ring-2 ring-canvas">
                  {i + 1}
                </span>
              </span>
              <span className="max-w-full truncate text-[12px] font-semibold text-ink">
                {SOURCE_META[s].short}
              </span>
            </li>
          </Fragment>
        ))}
      </ol>
      {schedule?.enabled && installed.includes("solar") && (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted">
          <Clock3 className="mt-0.5 size-3.5 shrink-0 text-solar" />
          <span>
            {t("الشمسية في الوضع الذكي فقط:")} {schedule.periods.map(describePeriod).join(t("، "))}
          </span>
        </p>
      )}
    </div>
  );
}
