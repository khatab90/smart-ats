import { History } from "lucide-react";
import { EmptyState, Segmented } from "../components/ui";
import { useActiveDevice } from "../store/devices";
import { useNav } from "../store/nav";
import { RuntimeLog } from "../features/logs/RuntimeLog";
import { SwitchLog } from "../features/logs/SwitchLog";

export function Logs() {
  const { view, setView } = useNav();
  const { device } = useActiveDevice();
  // The sub-tab lives in the address (#/logs:runtime), so links, refresh and
  // notifications that open a sub-tab always show the right one.
  const tab: "switch" | "runtime" = view === "runtime" ? "runtime" : "switch";
  if (!device) {
    return (
      <div className="px-5 pt-16">
        <EmptyState icon={History} title="لا يوجد جهاز" body="أضف جهازاً لعرض السجل." />
      </div>
    );
  }
  return (
    <div className="space-y-4 px-5 pt-4 pb-32">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">السجل</h1>
        <p className="text-[13px] text-muted">عمليات التحويل وساعات تشغيل المصادر</p>
      </div>
      <Segmented
        value={tab}
        onChange={setView}
        options={[
          { value: "switch", label: "التحويلات" },
          { value: "runtime", label: "ساعات التشغيل" },
        ]}
      />
      {tab === "switch" ? <SwitchLog /> : <RuntimeLog />}
    </div>
  );
}
