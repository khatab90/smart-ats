import type { NotificationType, Role, SourceId } from "./types";

export const SOURCE_META: Record<
  SourceId,
  { name: string; short: string; color: string; soft: string; text: string; bg: string }
> = {
  grid: {
    name: "الشبكة الوطنية",
    short: "الشبكة",
    color: "#2f7bf6",
    soft: "#e6effe",
    text: "text-grid",
    bg: "bg-grid",
  },
  solar: {
    name: "الطاقة الشمسية",
    short: "الشمسية",
    color: "#e0a100",
    soft: "#fdf5dc",
    text: "text-solar",
    bg: "bg-solar",
  },
  generator: {
    name: "المولد",
    short: "المولد",
    color: "#7a5af8",
    soft: "#efebfe",
    text: "text-gen",
    bg: "bg-gen",
  },
};

export const SOURCE_ORDER: SourceId[] = ["grid", "solar", "generator"];

export const MODE_LABEL = { smart: "الذكي", manual: "يدوي" } as const;

/** Why a source is unavailable, as reported by the board. */
export const UNAVAILABLE_REASON: Record<string, string> = {
  no_voltage: "لا يوجد جهد",
  undervoltage: "انخفاض الجهد",
  overvoltage: "ارتفاع الجهد",
  underfrequency: "انخفاض التردد",
  overfrequency: "ارتفاع التردد",
  qualifying: "قيد التأهيل",
  outside_schedule: "خارج الوقت المحدد",
  locked_out: "مقفل بالحماية",
  inverter_fault: "عطل في الإنفرتر",
  sensor_fault: "قراءة غير منطقية",
  not_installed: "غير موصول",
};

/** Transfer reasons reported by the board in event.data.reason. */
export const TRANSFER_REASON: Record<string, string> = {
  source_lost: "انقطاع المصدر",
  no_voltage: "انقطاع الجهد",
  source_restored: "عودة مصدر بعد انقطاع كلي",
  locked_out: "قفل الحماية",
  inverter_fault: "عطل في الإنفرتر",
  sensor_fault: "قراءة غير منطقية",
  undervoltage: "انخفاض الجهد",
  overvoltage: "ارتفاع الجهد",
  underfrequency: "انخفاض التردد",
  overfrequency: "ارتفاع التردد",
  priority_return: "عودة المصدر الأعلى أولوية",
  manual: "تحويل يدوي",
  mode_change: "تغيير الوضع",
  schedule: "انتهاء وقت الطاقة الشمسية",
  protection: "تدخل الحماية",
  target_lost: "خرج المصدر الهدف عن الحدود قبل التوصيل",
  close_failed: "لم يتأكد إغلاق الكونتاكتور",
};

export const ALARM_LABEL: Record<string, string> = {
  interlock_mismatch: "عدم تطابق حالة الكونتاكتور",
  transfer_lockout: "قفل بسبب تحويلات متكررة",
  sensor_fault: "قراءة مستشعر غير منطقية",
  over_temperature: "ارتفاع حرارة البورد",
  inverter_fault: "عطل الإنفرتر",
  generator_alarm: "إنذار المولد العام",
  settings_incomplete: "الجهد والتردد الاسميان غير محددين (يعمل البورد بقيم المصنع 230V / 50Hz)",
};

export const NOTIF_META: Record<
  NotificationType,
  { label: string; text: string; bg: string; critical: boolean; desc: string }
> = {
  source_outage: {
    label: "انقطاع المصدر الحالي",
    desc: "عند انقطاع المصدر الذي يغذي الأحمال أو عدم توفر أي مصدر",
    text: "text-danger",
    bg: "bg-danger-soft",
    critical: true,
  },
  transfer: {
    label: "التحويل بين المصادر",
    desc: "عند حدوث تحويل، مع المصدر السابق والجديد",
    text: "text-brand-600",
    bg: "bg-brand-100",
    critical: false,
  },
  electrical_fault: {
    label: "الخلل الكهربائي",
    desc: "انخفاض أو ارتفاع الجهد، أو خروج التردد عن الحدود",
    text: "text-warn",
    bg: "bg-warn-soft",
    critical: false,
  },
  connection_lost: {
    label: "انقطاع الاتصال بالبورد",
    desc: "عند توقف وصول البيانات من وحدة ESP32",
    text: "text-ink-2",
    bg: "bg-line",
    critical: false,
  },
  transfer_failed: {
    label: "فشل عملية التحويل",
    desc: "عند تعذر الانتقال إلى المصدر البديل أو عطل القفل المتبادل",
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
    label: "مسؤول",
    desc: "التحكم بالنظام وإدارة الإعدادات والمستخدمين",
    text: "text-brand-700",
    bg: "bg-brand-100",
  },
  viewer: {
    label: "مشاهد",
    desc: "عرض حالة النظام والقراءات دون صلاحية التحكم",
    text: "text-ink-2",
    bg: "bg-line",
  },
};

export const PERMISSIONS: { label: string; roles: Role[] }[] = [
  { label: "عرض حالة النظام والقراءات والسجلات", roles: ["admin", "viewer"] },
  { label: "تغيير وضع النظام والتحويل اليدوي", roles: ["admin"] },
  { label: "ترتيب الأولوية وإعدادات الجهاز", roles: ["admin"] },
  { label: "تصفير ساعات التشغيل", roles: ["admin"] },
  { label: "دعوة المستخدمين وإدارة صلاحياتهم", roles: ["admin"] },
];

/** Readable transfer reason, or null when the board sent none or an unknown code. */
export function transferReasonText(reason: unknown): string | null {
  return typeof reason === "string" ? (TRANSFER_REASON[reason] ?? null) : null;
}
