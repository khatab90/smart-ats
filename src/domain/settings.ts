/**
 * Device settings schema — the app's single source of truth for every
 * editable limit (labels, units, ranges, cross-field rules).
 *
 * The database enforces the same ranges with CHECK constraints; the test
 * tests/db/settings-schema.test.ts proves the two agree, value by value.
 */
import type { EditableSettings } from "../data/types";
import { isValidTimeZone } from "../lib/tz";
import { validateSchedule } from "./schedule";

/** Allowed nominal values (DB: CHECK nominal_voltage IN (...), nominal_frequency IN (...)). */
export const NOMINAL_VOLTAGES = [220, 230, 240] as const;
export const NOMINAL_FREQUENCIES = [50, 60] as const;

export type NumKey = {
  [K in keyof EditableSettings]: EditableSettings[K] extends number | null ? K : never;
}[keyof EditableSettings];

export interface NumField {
  key: NumKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  optional?: boolean;
  hint?: string;
}

export const SETTINGS_GROUPS: { title: string; desc: string; fields: NumField[] }[] = [
  {
    title: "حدود الجهد",
    desc: "نسب من الجهد الاسمي. يُفصل المصدر عند تجاوز حد الفصل لمدة المهلة، ولا يعود إلا ضمن حد الرجوع.",
    fields: [
      {
        key: "uv_trip_pct",
        label: "فصل عند انخفاض الجهد",
        unit: "% تحت الاسمي",
        min: 5,
        max: 30,
        step: 0.5,
      },
      {
        key: "uv_recover_pct",
        label: "الرجوع بعد الانخفاض",
        unit: "% تحت الاسمي",
        min: 2,
        max: 29,
        step: 0.5,
      },
      { key: "uv_delay_ms", label: "مهلة الانخفاض", unit: "ms", min: 100, max: 30000, step: 100 },
      {
        key: "ov_trip_pct",
        label: "فصل عند ارتفاع الجهد",
        unit: "% فوق الاسمي",
        min: 3,
        max: 25,
        step: 0.5,
      },
      {
        key: "ov_recover_pct",
        label: "الرجوع بعد الارتفاع",
        unit: "% فوق الاسمي",
        min: 1,
        max: 24,
        step: 0.5,
      },
      { key: "ov_delay_ms", label: "مهلة الارتفاع", unit: "ms", min: 50, max: 10000, step: 50 },
    ],
  },
  {
    title: "حدود التردد",
    desc: "نسب من التردد الاسمي.",
    fields: [
      { key: "uf_trip_pct", label: "فصل عند انخفاض التردد", unit: "%", min: 1, max: 10, step: 0.5 },
      { key: "of_trip_pct", label: "فصل عند ارتفاع التردد", unit: "%", min: 1, max: 10, step: 0.5 },
      { key: "f_recover_pct", label: "نطاق الرجوع", unit: "± %", min: 0.5, max: 9, step: 0.5 },
      { key: "f_delay_ms", label: "مهلة التردد", unit: "ms", min: 100, max: 30000, step: 100 },
    ],
  },
  {
    title: "مؤقتات التحويل",
    desc: "تمنع التحويل المتكرر وتضمن تحويلاً آمناً للأحمال ذات المحركات.",
    fields: [
      {
        key: "return_delay_s",
        label: "مدة الاستقرار قبل العودة",
        unit: "ث",
        min: 30,
        max: 1800,
        hint: "يجب أن يبقى المصدر الأعلى أولوية مستقراً طوال هذه المدة قبل العودة إليه.",
      },
      { key: "min_dwell_s", label: "أقل مدة بقاء على المصدر", unit: "ث", min: 0, max: 1800 },
      {
        key: "neutral_delay_ms",
        label: "فترة التوقف بين الفصل والوصل",
        unit: "ms",
        min: 500,
        max: 3000,
        step: 100,
      },
      {
        key: "transfer_timeout_ms",
        label: "مهلة اعتبار التحويل فاشلاً",
        unit: "ms",
        min: 1000,
        max: 30000,
        step: 500,
      },
      { key: "rate_limit_count", label: "أقصى عدد تحويلات", unit: "تحويل", min: 2, max: 30 },
      {
        key: "rate_limit_window_min",
        label: "خلال",
        unit: "دقيقة",
        min: 1,
        max: 120,
        hint: "عند تجاوز العدد يُثبَّت النظام على أكثر المصادر استقراراً ويُرفع إنذار.",
      },
    ],
  },
  {
    title: "الوضع اليدوي",
    desc: "",
    fields: [
      {
        key: "manual_revert_min",
        label: "العودة تلقائياً للوضع الذكي بعد",
        unit: "دقيقة",
        min: 5,
        max: 1440,
        optional: true,
        hint: "اتركه فارغاً لإبقاء الوضع اليدوي حتى تغييره يدوياً.",
      },
    ],
  },
];

export const EDITABLE_KEYS: (keyof EditableSettings)[] = [
  "priority",
  "nominal_voltage",
  "nominal_frequency",
  ...SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => f.key)),
  "solar_schedule",
  "timezone",
];

/** JSON equality that ignores object key order (jsonb reorders keys). */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * What a save sends: the fields the user edited whose value now differs from
 * the server's. Untouched fields are never sent, so a save cannot overwrite
 * a change made meanwhile by another admin.
 */
export function changedFields(
  base: EditableSettings,
  edits: Partial<EditableSettings>,
): Partial<EditableSettings> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) {
    if (k in edits && !sameValue(edits[k], base[k])) out[k] = edits[k];
  }
  return out as Partial<EditableSettings>;
}

export function validateSettings(d: EditableSettings): string | null {
  for (const g of SETTINGS_GROUPS) {
    for (const f of g.fields) {
      const v = d[f.key];
      if (v === null) {
        if (!f.optional) return `«${f.label}» مطلوب.`;
        continue;
      }
      if (!Number.isFinite(v) || v < f.min || v > f.max)
        return `«${f.label}» يجب أن يكون بين ${f.min} و${f.max}.`;
    }
  }
  if (d.uv_recover_pct >= d.uv_trip_pct)
    return "حد الرجوع بعد الانخفاض يجب أن يكون أقرب للاسمي من حد الفصل.";
  if (d.ov_recover_pct >= d.ov_trip_pct)
    return "حد الرجوع بعد الارتفاع يجب أن يكون أقرب للاسمي من حد الفصل.";
  if (d.f_recover_pct >= Math.min(d.uf_trip_pct, d.of_trip_pct))
    return "نطاق رجوع التردد يجب أن يكون أضيق من حدود الفصل.";
  if (!isValidTimeZone(d.timezone)) return "المنطقة الزمنية غير صحيحة (مثال: Asia/Baghdad).";
  return validateSchedule(d.solar_schedule);
}
