import { Badge, type Tone } from "./ui";
import { UNAVAILABLE_REASON } from "../data/meta";
import type { SourceReport } from "../data/types";
import type { LinkState } from "../lib/link";
import { t } from "../i18n";

export function sourceBadge(
  report: SourceReport | undefined,
  active: boolean,
): { label: string; tone: Tone } {
  if (active) return { label: t("فعّال"), tone: "ok" };
  if (!report) return { label: t("لا توجد بيانات"), tone: "neutral" };
  if (report.qualified && report.allowed === false)
    return { label: UNAVAILABLE_REASON.outside_schedule, tone: "neutral" };
  if (report.qualified) return { label: t("متاح"), tone: "info" };
  // No voltage at all: the source is simply off (a stopped generator, a grid cut).
  if (report.reason === "no_voltage" || (!report.available && !report.reason))
    return { label: t("طافي"), tone: "neutral" };
  // Qualifying only when the board says so; a source out of its limits shows why.
  if (report.reason === "qualifying" || (report.available && !report.reason)) {
    const done = report.q_elapsed_s ?? null;
    const need = report.q_required_s ?? null;
    return {
      label:
        done !== null && need ? t("قيد التأهيل {0}/{1} ث", { 0: done, 1: need }) : t("قيد التأهيل"),
      tone: "warn",
    };
  }
  return { label: UNAVAILABLE_REASON[report.reason ?? ""] ?? t("غير متاح"), tone: "danger" };
}

export function LinkBadge({ link }: { link: LinkState }) {
  if (link === "live")
    return (
      <Badge tone="ok" dot pulse>
        {t("متصل")}
      </Badge>
    );
  if (link === "stale")
    return (
      <Badge tone="warn" dot>
        {t("بيانات متأخرة")}
      </Badge>
    );
  if (link === "offline")
    return (
      <Badge tone="danger" dot>
        {t("غير متصل")}
      </Badge>
    );
  return (
    <Badge tone="neutral" dot>
      {t("لا توجد بيانات")}
    </Badge>
  );
}
