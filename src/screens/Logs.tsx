import { History } from "lucide-react";
import { EmptyState, Segmented } from "../components/ui";
import { useActiveDevice } from "../store/devices";
import { useNav } from "../store/nav";
import { RuntimeLog } from "../features/logs/RuntimeLog";
import { SwitchLog } from "../features/logs/SwitchLog";
import { t } from "../i18n";

export function Logs() {
  const { view, setView } = useNav();
  const { device } = useActiveDevice();
  // The sub-tab lives in the address (#/logs:runtime), so links, refresh and
  // notifications that open a sub-tab always show the right one.
  const tab: "switch" | "runtime" = view === "runtime" ? "runtime" : "switch";
  if (!device) {
    return (
      <div className="px-5 pt-16">
        <EmptyState icon={History} title={t("لا يوجد جهاز")} body={t("أضف جهازاً لعرض السجل.")} />
      </div>
    );
  }
  return (
    <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{t("السجل")}</h1>
        <p className="text-[13px] text-muted">{t("عمليات التحويل وساعات تشغيل المصادر")}</p>
      </div>
      <Segmented
        className="lg:max-w-md"
        value={tab}
        onChange={setView}
        options={[
          { value: "switch", label: t("التحويلات") },
          { value: "runtime", label: t("ساعات التشغيل") },
        ]}
      />
      {tab === "switch" ? <SwitchLog /> : <RuntimeLog />}
    </div>
  );
}
