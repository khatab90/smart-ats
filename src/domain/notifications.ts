/**
 * Notification text rendered on the client from the facts the server
 * stores in `notifications.params`. The server still writes a fallback
 * title/body (used for old rows and future push messages), but the app
 * owns the wording, so changing it never needs a database migration.
 */
import { SOURCE_META } from "../data/meta";
import type { NotificationRow, NotificationType, SourceId } from "../data/types";

const src = (id: SourceId | null | undefined) => (id ? SOURCE_META[id].name : "مصدر غير معروف");

const FAULT: Record<string, string> = {
  undervoltage: "انخفاض الجهد",
  overvoltage: "ارتفاع الجهد",
  underfrequency: "انخفاض التردد",
  overfrequency: "ارتفاع التردد",
  unstable: "تحويلات متكررة بسبب عدم الاستقرار",
};

const FAIL_REASON: Record<string, string> = {
  target_lost: "خرج المصدر عن الحدود قبل التوصيل",
  close_failed: "لم يتأكد إغلاق الكونتاكتور",
};

export function notificationText(n: Pick<NotificationRow, "type" | "title" | "body" | "params">): {
  title: string;
  body: string;
} {
  const p = n.params ?? {};
  const where = p.device ? ` في «${p.device}»` : "";
  switch (p.event) {
    case "source_lost":
      return {
        title: "انقطاع المصدر الحالي",
        body: `انقطع ${src(p.source)} الذي يغذي الأحمال${where}.`,
      };
    case "no_source":
      return {
        title: "لا يوجد مصدر متاح",
        body: `الأحمال${where} بدون كهرباء: لا يوجد أي مصدر صالح للتشغيل.`,
      };
    case "transfer":
      return {
        title: "تحويل بين المصادر",
        body: `تم التحويل من ${p.from ? src(p.from) : "لا يوجد مصدر"} إلى ${src(p.to)}${where}.`,
      };
    case "electrical_fault":
    case "transfer_lockout": {
      const what = FAULT[p.kind ?? ""] ?? "خروج عن حدود التشغيل";
      const on = p.source ? src(p.source) : "النظام";
      return {
        title: "خلل كهربائي",
        body: `${what} في ${on}${p.value ? `: ${p.value}` : ""}${where}.`,
      };
    }
    case "connection_lost":
      return {
        title: "انقطاع الاتصال بالبورد",
        body: `لم تصل بيانات من الجهاز${where} منذ أكثر من 30 ثانية.`,
      };
    case "transfer_failed": {
      const why = FAIL_REASON[p.reason ?? ""];
      return {
        title: "فشل عملية التحويل",
        body: `تعذر الانتقال إلى ${src(p.to)}${where}${why ? ` (${why})` : ""}.`,
      };
    }
    case "interlock_fault":
      return {
        title: "فشل التحويل: عطل القفل المتبادل",
        body: `عدم تطابق بين أمر الكونتاكتور وحالته الفعلية${where}. تم قفل النظام ويتطلب فحصاً في الموقع.`,
      };
    default:
      return { title: n.title, body: n.body };
  }
}

/** Types that interrupt power or protection; muting them shows a warning. */
export const CRITICAL_TYPES: readonly NotificationType[] = ["source_outage", "transfer_failed"];
