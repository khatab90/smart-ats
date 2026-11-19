import { useMemo, useState } from "react";
import { updateSettings } from "../../api/settings";
import type { DeviceSettings, EditableSettings } from "../../data/types";
import { EDITABLE_KEYS, changedFields, validateSettings } from "../../domain/settings";
import { asSchedule } from "../../domain/schedule";
import { useActiveDevice } from "../../store/devices";
import { useToast } from "../../store/toast";
import { t } from "../../i18n";

/** The editable part of the device's settings as the server has it now. */
export function useServerSettings(): EditableSettings | null {
  const { settings } = useActiveDevice();
  return useMemo<EditableSettings | null>(() => {
    if (!settings) return null;
    const out = {} as Record<string, unknown>;
    for (const k of EDITABLE_KEYS) out[k] = (settings as DeviceSettings)[k];
    out.solar_schedule = asSchedule(out.solar_schedule);
    return out as unknown as EditableSettings;
  }, [settings]);
}

/**
 * Form state for one settings screen. Only the fields the user touched are
 * kept; they are shown over the latest server values, so a save, a refresh
 * or another admin's change can never bring back stale values. A save sends
 * only the changed fields.
 */
export function useSettingsForm() {
  const { device, isAdmin, refresh } = useActiveDevice();
  const { pushToast } = useToast();
  const base = useServerSettings();
  const [edits, setEdits] = useState<Partial<EditableSettings>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const draft = useMemo<EditableSettings | null>(
    () => (base ? { ...base, ...edits } : null),
    [base, edits],
  );
  const changed = useMemo(() => (base ? changedFields(base, edits) : {}), [base, edits]);
  const changeCount = Object.keys(changed).length;

  const set = <K extends keyof EditableSettings>(k: K, v: EditableSettings[K]) =>
    setEdits((e) => ({ ...e, [k]: v }));

  const discard = () => {
    setEdits({});
    setFormError("");
  };

  /** Resolves true when saved. */
  const save = async (): Promise<boolean> => {
    if (!draft || !device) return false;
    const v = validateSettings(draft);
    if (v) {
      setFormError(v);
      return false;
    }
    setFormError("");
    setSaving(true);
    const { error } = await updateSettings(device.id, changed);
    setSaving(false);
    if (error !== null) {
      setFormError(error);
      return false;
    }
    pushToast({
      kind: "info",
      title: t("تم حفظ الإعدادات"),
      body: t("ستُطبَّق بعد أن يتحقق منها البورد ويؤكدها."),
    });
    await refresh();
    setEdits({});
    return true;
  };

  return {
    draft,
    set,
    save,
    discard,
    saving,
    formError,
    changeCount,
    dirty: changeCount > 0,
    readOnly: !isAdmin,
  };
}
