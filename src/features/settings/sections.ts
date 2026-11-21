import { Activity, Gauge, Hand, ListOrdered, Sun, Timer, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SettingsSection } from "../../store/nav";
import { t } from "../../i18n";

export const SECTION_META: Record<
  SettingsSection,
  { title: string; icon: LucideIcon; iconClass?: string }
> = {
  priority: { title: t("أولوية المصادر"), icon: ListOrdered },
  solar: { title: t("أوقات الطاقة الشمسية"), icon: Sun, iconClass: "bg-solar-soft text-solar" },
  manual: { title: t("الوضع اليدوي"), icon: Hand },
  nominal: { title: t("القيم الاسمية"), icon: Gauge },
  voltage: { title: t("حدود الجهد"), icon: Zap },
  frequency: { title: t("حدود التردد"), icon: Activity },
  timers: { title: t("مؤقتات التحويل"), icon: Timer },
};
