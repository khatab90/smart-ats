import { SOURCE_META } from "../../data/meta";
import type { EditableSettings, SourceId } from "../../data/types";
import { describePeriod } from "../../domain/schedule";
import { isRtl, t } from "../../i18n";

/** Keeps numbers and units left-to-right inside Arabic text. */
export const ltr = (s: string) => `⁦${s}⁩`;

/** "الشبكة ← الشمسية ← المولد" (arrow follows the reading direction). */
export function priorityText(priority: SourceId[], installed: SourceId[]): string {
  return priority
    .filter((s) => installed.includes(s))
    .map((s) => SOURCE_META[s].short)
    .join(isRtl() ? " ← " : " → ");
}

export function voltageRange(d: EditableSettings): string | null {
  if (!d.nominal_voltage) return null;
  const lo = Math.round(d.nominal_voltage * (1 - d.uv_trip_pct / 100));
  const hi = Math.round(d.nominal_voltage * (1 + d.ov_trip_pct / 100));
  return ltr(`${lo}–${hi} V`);
}

export function frequencyRange(d: EditableSettings): string | null {
  if (!d.nominal_frequency) return null;
  const lo = (d.nominal_frequency * (1 - d.uf_trip_pct / 100)).toFixed(1);
  const hi = (d.nominal_frequency * (1 + d.of_trip_pct / 100)).toFixed(1);
  return ltr(`${lo}–${hi} Hz`);
}

/** One line per settings section, shown under its name in the list. */
export function sectionSummary(
  section: string,
  d: EditableSettings,
  installed: SourceId[],
): string {
  switch (section) {
    case "priority":
      return priorityText(d.priority, installed);
    case "solar":
      return d.solar_schedule.enabled && d.solar_schedule.periods.length
        ? d.solar_schedule.periods.map(describePeriod).join(t("، "))
        : t("بدون تقييد: تُستخدم في أي وقت حسب الأولوية");
    case "nominal":
      return d.nominal_voltage && d.nominal_frequency
        ? ltr(`${d.nominal_voltage} V • ${d.nominal_frequency} Hz`)
        : t("غير محددة — يجب ضبطها");
    case "voltage":
      return voltageRange(d) ?? t("حدد الجهد الاسمي أولاً");
    case "frequency":
      return frequencyRange(d) ?? t("حدد التردد الاسمي أولاً");
    case "timers":
      return t("استقرار {0} ث • توقف {1} ث", {
        0: d.return_delay_s,
        1: (d.neutral_delay_ms / 1000).toFixed(1),
      });
    case "manual":
      return d.manual_revert_min
        ? t("يعود للوضع الذكي بعد {0} دقيقة", { 0: d.manual_revert_min })
        : t("يبقى يدوياً حتى تغييره");
    default:
      return "";
  }
}
