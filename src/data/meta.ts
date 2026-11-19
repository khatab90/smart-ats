import type { NotificationType, Role, SourceId } from "./types";
import { t } from "../i18n";

export const SOURCE_META: Record<
  SourceId,
  { name: string; short: string; color: string; soft: string; text: string; bg: string }
> = {
  grid: {
    name: t("الشبكة الوطنية"),
    short: t("الشبكة"),
    color: "#2f7bf6",
    soft: "var(--color-grid-soft)",
    text: "text-grid",
    bg: "bg-grid",
  },
  solar: {
    name: t("الطاقة الشمسية"),
    short: t("الشمسية"),
    color: "#e0a100",
    soft: "var(--color-solar-soft)",
    text: "text-solar",
    bg: "bg-solar",
  },
  generator: {
    name: t("المولد"),
    short: t("المولد"),
    color: "#7a5af8",
    soft: "var(--color-gen-soft)",
    text: "text-gen",
    bg: "bg-gen",
  },
};

export const SOURCE_ORDER: SourceId[] = ["grid", "solar", "generator"];

export const MODE_LABEL = { smart: t("الذكي"), manual: t("يدوي") } as const;

/** Why a source is unavailable, as reported by the board. */
export const UNAVAILABLE_REASON: Record<string, string> = {
  no_voltage: t("لا يوجد جهد"),
  undervoltage: t("انخفاض الجهد"),
  overvoltage: t("ارتفاع الجهد"),
  underfrequency: t("انخفاض التردد"),
  overfrequency: t("ارتفاع التردد"),
  qualifying: t("قيد التأهيل"),
  outside_schedule: t("خارج الوقت المحدد"),
  locked_out: t("مقفل بالحماية"),
  inverter_fault: t("عطل في الإنفرتر"),
  sensor_fault: t("قراءة غير منطقية"),
  not_installed: t("غير موصول"),
};

/** Transfer reasons reported by the board in event.data.reason. */
export const TRANSFER_REASON: Record<string, string> = {
  source_lost: t("انقطاع المصدر"),
  no_voltage: t("انقطاع الجهد"),
  source_restored: t("عودة مصدر بعد انقطاع كلي"),
  locked_out: t("قفل الحماية"),
  inverter_fault: t("عطل في الإنفرتر"),
  sensor_fault: t("قراءة غير منطقية"),
  undervoltage: t("انخفاض الجهد"),
  overvoltage: t("ارتفاع الجهد"),
  underfrequency: t("انخفاض التردد"),
  overfrequency: t("ارتفاع التردد"),
  priority_return: t("عودة المصدر الأعلى أولوية"),
  manual: t("تحويل يدوي"),
  mode_change: t("تغيير الوضع"),
  schedule: t("انتهاء وقت الطاقة الشمسية"),
  protection: t("تدخل الحماية"),
  target_lost: t("خرج المصدر الهدف عن الحدود قبل التوصيل"),
  close_failed: t("لم يتأكد إغلاق الكونتاكتور"),
};

export const ALARM_LABEL: Record<string, string> = {
  interlock_mismatch: t("عدم تطابق حالة الكونتاكتور"),
  transfer_lockout: t("قفل بسبب تحويلات متكررة"),
  sensor_fault: t("قراءة مستشعر غير منطقية"),
  over_temperature: t("ارتفاع حرارة البورد"),
  inverter_fault: t("عطل الإنفرتر"),
  generator_alarm: t("إنذار المولد العام"),
  settings_incomplete: t("الجهد والتردد الاسميان غير محددين (يعمل البورد بقيم المصنع 230V / 50Hz)"),
};

export const NOTIF_META: Record<
  NotificationType,
  { label: string; text: string; bg: string; critical: boolean; desc: string }
> = {
  source_outage: {
    label: t("انقطاع المصدر الحالي"),
    desc: t("عند انقطاع المصدر الذي يغذي الأحمال أو عدم توفر أي مصدر"),
    text: "text-danger",
    bg: "bg-danger-soft",
    critical: true,
  },
  transfer: {
    label: t("التحويل بين المصادر"),
    desc: t("عند حدوث تحويل، مع المصدر السابق والجديد"),
    text: "text-brand-600",
    bg: "bg-brand-100",
    critical: false,
  },
  electrical_fault: {
    label: t("الخلل الكهربائي"),
    desc: t("انخفاض أو ارتفاع الجهد، أو خروج التردد عن الحدود"),
    text: "text-warn",
    bg: "bg-warn-soft",
    critical: false,
  },
  connection_lost: {
    label: t("انقطاع الاتصال بالبورد"),
    desc: t("عند توقف وصول البيانات من وحدة ESP32"),
    text: "text-ink-2",
    bg: "bg-line",
    critical: false,
  },
  transfer_failed: {
    label: t("فشل عملية التحويل"),
    desc: t("عند تعذر الانتقال إلى المصدر البديل أو عطل القفل المتبادل"),
    text: "text-danger",
    bg: "bg-danger-soft",
    critical: true,
  },
};

export const NOTIF_ORDER: NotificationType[] = [
  "source_outage",
  "transfer",
  "electrical_fault",
  "connection_lost",
  "transfer_failed",
];

export const ROLE_META: Record<Role, { label: string; desc: string; text: string; bg: string }> = {
  admin: {
    label: t("مسؤول"),
    desc: t("التحكم بالنظام وإدارة الإعدادات والمستخدمين"),
    text: "text-brand-700",
    bg: "bg-brand-100",
  },
  viewer: {
    label: t("مشاهد"),
    desc: t("عرض حالة النظام والقراءات دون صلاحية التحكم"),
    text: "text-ink-2",
    bg: "bg-line",
  },
};

export const PERMISSIONS: { label: string; roles: Role[] }[] = [
  { label: t("عرض حالة النظام والقراءات والسجلات"), roles: ["admin", "viewer"] },
  { label: t("تغيير وضع النظام والتحويل اليدوي"), roles: ["admin"] },
  { label: t("ترتيب الأولوية وإعدادات الجهاز"), roles: ["admin"] },
  { label: t("تصفير ساعات التشغيل"), roles: ["admin"] },
  { label: t("دعوة المستخدمين وإدارة صلاحياتهم"), roles: ["admin"] },
];

/** Readable transfer reason, or null when the board sent none or an unknown code. */
export function transferReasonText(reason: unknown): string | null {
  return typeof reason === "string" ? (TRANSFER_REASON[reason] ?? null) : null;
}
