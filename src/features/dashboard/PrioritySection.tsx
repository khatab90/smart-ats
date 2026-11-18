import { useState } from "react";
import { PriorityList } from "../../components/control";
import { Button } from "../../components/ui";
import { SOURCE_META } from "../../data/meta";
import type { SourceId } from "../../data/types";
import { generatorFirst, installedSources } from "../../domain/sources";
import { cn } from "../../lib/cn";
import { updateSettings } from "../../api/settings";
import { useActiveDevice } from "../../store/devices";
import { useToast } from "../../store/toast";

export function PrioritySection({
  priority,
  applied,
  editable,
}: {
  priority: SourceId[];
  applied: boolean;
  editable: boolean;
}) {
  const { device, link, status } = useActiveDevice();
  const installed = installedSources(status);
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<SourceId[] | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? priority;
  const dirty = draft !== null && draft.join() !== priority.join();

  const save = async () => {
    if (!device || !draft) return;
    setSaving(true);
    const { error } = await updateSettings(device.id, { priority: draft });
    setSaving(false);
    if (error !== null) return pushToast({ kind: "error", title: "تعذر حفظ الترتيب", body: error });
    setDraft(null);
    pushToast({ kind: "info", title: "تم حفظ ترتيب الأولوية", body: "سيُطبَّق بعد تأكيد البورد." });
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-bold text-ink">ترتيب أولوية المصادر</p>
        {!dirty && link !== "never" && (
          <span
            className={cn(
              "text-[11px] font-semibold",
              applied ? "text-ok-strong" : "text-warn-strong",
            )}
          >
            {applied ? "مطبَّق على البورد" : "بانتظار تأكيد البورد"}
          </span>
        )}
      </div>
      <PriorityList value={value} installed={installed} onChange={setDraft} disabled={!editable || saving} />
      {generatorFirst(value, installed) && (
        <p className="mt-2 rounded-2xl border border-warn/30 bg-warn-soft px-3 py-2 text-[11px] leading-5 font-semibold text-warn-strong">
          {SOURCE_META.generator.name} في المرتبة الأولى: سيشغّله البورد ويبقى عليه كلما كان سليماً، حتى لو
          كانت المصادر الأخرى متاحة.
        </p>
      )}
      <p className="mt-2 text-[11px] leading-5 text-muted">
        {editable ? "اسحب المصادر لإعادة ترتيبها. " : ""}يعتمد البورد على المصدر الأول إذا كان مستوفياً
        لشروط التشغيل، وإلا ينتقل إلى التالي، ويعود إلى الأعلى أولوية بعد استقراره.
      </p>
      {dirty && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" loading={saving} onClick={save}>
            حفظ الترتيب
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setDraft(null)}>
            تراجع
          </Button>
        </div>
      )}
    </div>
  );
}
