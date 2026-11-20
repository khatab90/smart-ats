import { History } from "lucide-react";
import { Segmented } from "../components/ui";
import {
  NoDevice,
  PageHeading,
  WaitingForBoard,
  useAwaitingFirstData,
} from "../components/DeviceGate";
import { useActiveDevice } from "../store/devices";
import { useNav } from "../store/nav";
import { RuntimeLog } from "../features/logs/RuntimeLog";
import { SwitchLog } from "../features/logs/SwitchLog";
import { t } from "../i18n";

export function Logs() {
  const { view, setView } = useNav();
  const { device } = useActiveDevice();
  const awaiting = useAwaitingFirstData();
  // The sub-tab lives in the address (#/logs:runtime), so links, refresh and
  // notifications that open a sub-tab always show the right one.
  const tab: "switch" | "runtime" = view === "runtime" ? "runtime" : "switch";
  const heading = (
    <PageHeading title={t("السجل")} subtitle={t("عمليات التحويل وساعات تشغيل المصادر")} />
  );
  if (!device || awaiting) {
    return (
      <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
        {heading}
        {device ? (
          <WaitingForBoard compact />
        ) : (
          <NoDevice icon={History} body={t("أضف جهازاً لعرض السجل.")} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
      {heading}
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
