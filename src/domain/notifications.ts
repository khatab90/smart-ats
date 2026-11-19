/**
 * Notification text rendered on the client from the facts the server
 * stores in `notifications.params`. The server still writes a fallback
 * title/body (used for old rows and future push messages), but the app
 * owns the wording, so changing it never needs a database migration.
 */
import { SOURCE_META } from "../data/meta";
import type { NotificationRow, NotificationType, SourceId } from "../data/types";
import { t } from "../i18n";

const src = (id: SourceId | null | undefined) => (id ? SOURCE_META[id].name : t("مصدر غير معروف"));

const FAULT: Record<string, string> = {
  undervoltage: t("انخفاض الجهد"),
  overvoltage: t("ارتفاع الجهد"),
  underfrequency: t("انخفاض التردد"),
  overfrequency: t("ارتفاع التردد"),
  unstable: t("تحويلات متكررة بسبب عدم الاستقرار"),
};

const FAIL_REASON: Record<string, string> = {
  target_lost: t("خرج المصدر عن الحدود قبل التوصيل"),
  close_failed: t("لم يتأكد إغلاق الكونتاكتور"),
};

export function notificationText(n: Pick<NotificationRow, "type" | "title" | "body" | "params">): {
  title: string;
  body: string;
} {
  const p = n.params ?? {};
  const where = p.device ? t(" في «{0}»", { 0: p.device }) : "";
  switch (p.event) {
    case "source_lost":
      return {
        title: t("انقطاع المصدر الحالي"),
        body: t("انقطع {0} الذي يغذي الأحمال{1}.", { 0: src(p.source), 1: where }),
      };
    case "no_source":
      return {
        title: t("لا يوجد مصدر متاح"),
        body: t("الأحمال{0} بدون كهرباء: لا يوجد أي مصدر صالح للتشغيل.", { 0: where }),
      };
    case "transfer":
      return {
        title: t("تحويل بين المصادر"),
        body: t("تم التحويل من {0} إلى {1}{2}.", {
          0: p.from ? src(p.from) : t("لا يوجد مصدر"),
          1: src(p.to),
          2: where,
        }),
      };
    case "electrical_fault":
    case "transfer_lockout": {
      const what = FAULT[p.kind ?? ""] ?? t("خروج عن حدود التشغيل");
      const on = p.source ? src(p.source) : t("النظام");
      return {
        title: t("خلل كهربائي"),
        body: t("{0} في {1}{2}{3}.", {
          0: what,
          1: on,
          2: p.value ? `: ${p.value}` : "",
          3: where,
        }),
      };
    }
    case "connection_lost":
      return {
        title: t("انقطاع الاتصال بالبورد"),
        body: t("لم تصل بيانات من الجهاز{0} منذ أكثر من 30 ثانية.", { 0: where }),
      };
    case "transfer_failed": {
      const why = FAIL_REASON[p.reason ?? ""];
      return {
        title: t("فشل عملية التحويل"),
        body: t("تعذر الانتقال إلى {0}{1}{2}.", {
          0: src(p.to),
          1: where,
          2: why ? ` (${why})` : "",
        }),
      };
    }
    case "interlock_fault":
      return {
        title: t("فشل التحويل: عطل القفل المتبادل"),
        body: t(
          "عدم تطابق بين أمر الكونتاكتور وحالته الفعلية{0}. تم قفل النظام ويتطلب فحصاً في الموقع.",
          { 0: where },
        ),
      };
    default:
      return { title: n.title, body: n.body };
  }
}

/** Types that interrupt power or protection; muting them shows a warning. */
export const CRITICAL_TYPES: readonly NotificationType[] = ["source_outage", "transfer_failed"];
