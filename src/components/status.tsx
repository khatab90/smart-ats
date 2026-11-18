import { Badge, type Tone } from "./ui";
import { UNAVAILABLE_REASON } from "../data/meta";
import type { SourceReport } from "../data/types";
import type { LinkState } from "../lib/link";

export function sourceBadge(
  report: SourceReport | undefined,
  active: boolean,
): { label: string; tone: Tone } {
  if (active) return { label: "فعّال", tone: "ok" };
  if (!report) return { label: "لا توجد بيانات", tone: "neutral" };
  if (report.qualified && report.allowed === false)
    return { label: UNAVAILABLE_REASON.outside_schedule, tone: "neutral" };
  if (report.qualified) return { label: "متاح", tone: "info" };
  if (report.reason === "qualifying" || (report.available && !report.qualified)) {
    const done = report.q_elapsed_s ?? null;
    const need = report.q_required_s ?? null;
    return {
      label: done !== null && need ? `قيد التأهيل ${done}/${need} ث` : "قيد التأهيل",
      tone: "warn",
    };
  }
  return { label: UNAVAILABLE_REASON[report.reason ?? ""] ?? "غير متاح", tone: "danger" };
}

export function LinkBadge({ link }: { link: LinkState }) {
  if (link === "live")
    return (
      <Badge tone="ok" dot pulse>
        متصل
      </Badge>
    );
  if (link === "stale")
    return (
      <Badge tone="warn" dot>
        بيانات متأخرة
      </Badge>
    );
  if (link === "offline")
    return (
      <Badge tone="danger" dot>
        غير متصل
      </Badge>
    );
  return (
    <Badge tone="neutral" dot>
      لا توجد بيانات
    </Badge>
  );
}
