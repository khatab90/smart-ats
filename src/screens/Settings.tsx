import { CircleCheck, LoaderCircle, Save, Settings2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PriorityList } from "../components/control";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ScreenHeader,
  Segmented,
  Skeleton,
} from "../components/ui";
import type { DeviceSettings, EditableSettings, SourceId } from "../data/types";
import {
  EDITABLE_KEYS,
  NOMINAL_FREQUENCIES,
  NOMINAL_VOLTAGES,
  SETTINGS_GROUPS,
  validateSettings,
  type NumField,
} from "../domain/settings";
import { cn } from "../lib/cn";
import { fmtDateTime } from "../lib/format";
import { updateSettings } from "../api/settings";
import { installedSources } from "../domain/sources";
import { asSchedule } from "../domain/schedule";
import { SolarScheduleEditor } from "../features/settings/SolarScheduleEditor";
import { useActiveDevice } from "../store/devices";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";

export function Settings() {
  const { device, settings, isAdmin, settingsApplied, status, loading, error, refresh } =
    useActiveDevice();
  const { back } = useNav();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<EditableSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const base = useMemo<EditableSettings | null>(() => {
    if (!settings) return null;
    const out = {} as Record<string, unknown>;
    for (const k of EDITABLE_KEYS) out[k] = (settings as DeviceSettings)[k];
    out.solar_schedule = asSchedule(out.solar_schedule);
    return out as unknown as EditableSettings;
  }, [settings]);

  useEffect(() => {
    if (base && !draft) setDraft(base);
  }, [base, draft]);

  const changed = useMemo(() => {
    if (!draft || !base) return {} as Partial<EditableSettings>;
    const out: Record<string, unknown> = {};
    for (const k of EDITABLE_KEYS) {
      if (JSON.stringify(draft[k]) !== JSON.stringify(base[k])) out[k] = draft[k];
    }
    return out as Partial<EditableSettings>;
  }, [draft, base]);
  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    if (!draft || !device) return;
    const v = validateSettings(draft);
    if (v) return setFormError(v);
    setFormError("");
    setSaving(true);
    const { error: err } = await updateSettings(device.id, changed);
    setSaving(false);
    if (err !== null) return setFormError(err);
    pushToast({
      kind: "info",
      title: "تم حفظ الإعدادات",
      body: "ستُطبَّق بعد أن يتحقق منها البورد ويؤكدها.",
    });
    setDraft(null);
    await refresh();
  };

  const set = <K extends keyof EditableSettings>(k: K, v: EditableSettings[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const readOnly = !isAdmin;

  return (
    <div className="pb-6">
      <ScreenHeader
        title="إعدادات الجهاز"
        subtitle={device ? device.name || device.id : undefined}
        onBack={back}
      />
      <div className="space-y-4 px-5">
        {!device ? (
          <EmptyState icon={Settings2} title="لا يوجد جهاز" body="أضف جهازاً أولاً." />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading || !draft || !settings ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <Card className="flex items-center gap-3 p-4">
              {settingsApplied ? (
                <CircleCheck className="size-5 text-ok" />
              ) : (
                <LoaderCircle className="size-5 animate-spin text-warn" />
              )}
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  الإصدار {settings.version}{" "}
                  {settingsApplied ? "مطبَّق على البورد" : "بانتظار تأكيد البورد"}
                </p>
                <p className="num text-[11px] text-muted">
                  آخر تعديل {fmtDateTime(Date.parse(settings.updated_at), settings.timezone)} •
                  إصدار البورد {status?.config_version ?? "—"}
                </p>
              </div>
            </Card>
            {readOnly && (
              <p className="rounded-2xl bg-canvas px-4 py-3 text-[12px] text-muted">
                صلاحيتك «مشاهد»: الإعدادات للعرض فقط.
              </p>
            )}

            <Card className="space-y-4 p-4">
              <p className="text-[15px] font-bold text-ink">القيم الاسمية</p>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink-2">الجهد الاسمي</p>
                <Segmented
                  value={String(draft.nominal_voltage ?? "")}
                  onChange={(v) => set("nominal_voltage", Number(v))}
                  options={NOMINAL_VOLTAGES.map(String).map((v) => ({
                    value: v,
                    label: `${v} V`,
                    disabled: readOnly,
                  }))}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink-2">التردد الاسمي</p>
                <Segmented
                  value={String(draft.nominal_frequency ?? "")}
                  onChange={(v) => set("nominal_frequency", Number(v))}
                  options={NOMINAL_FREQUENCIES.map(String).map((v) => ({
                    value: v,
                    label: `${v} Hz`,
                    disabled: readOnly,
                  }))}
                />
              </div>
              {(!draft.nominal_voltage || !draft.nominal_frequency) && (
                <p className="text-[11px] text-warn-strong">
                  يجب تحديد الجهد والتردد الاسميين حسب شبكة موقع التركيب.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-[15px] font-bold text-ink">أولوية المصادر (الوضع الذكي)</p>
              <PriorityList
                value={draft.priority}
                installed={installedSources(status)}
                onChange={(p: SourceId[]) => set("priority", p)}
                disabled={readOnly}
              />
            </Card>

            {installedSources(status).includes("solar") && (
              <SolarScheduleEditor
                value={draft.solar_schedule}
                onChange={(v) => set("solar_schedule", v)}
                timezone={draft.timezone}
                disabled={readOnly}
              />
            )}

            {SETTINGS_GROUPS.map((g) => (
              <Card key={g.title} className="p-4">
                <p className="text-[15px] font-bold text-ink">{g.title}</p>
                {g.desc && <p className="mt-0.5 text-[11px] leading-5 text-muted">{g.desc}</p>}
                <div className="mt-3 space-y-3">
                  {g.fields.map((f) => (
                    <NumberRow
                      key={f.key}
                      field={f}
                      value={draft[f.key]}
                      readOnly={readOnly}
                      onChange={(v) => set(f.key, v as never)}
                    />
                  ))}
                </div>
                {g.title === "حدود الجهد" && draft.nominal_voltage && (
                  <p className="num mt-3 rounded-xl bg-canvas px-3 py-2 text-[11px] text-ink-2">
                    النطاق المسموح:{" "}
                    <span dir="ltr">
                      {Math.round(draft.nominal_voltage * (1 - draft.uv_trip_pct / 100))}–
                      {Math.round(draft.nominal_voltage * (1 + draft.ov_trip_pct / 100))} V
                    </span>
                  </p>
                )}
                {g.title === "حدود التردد" && draft.nominal_frequency && (
                  <p className="num mt-3 rounded-xl bg-canvas px-3 py-2 text-[11px] text-ink-2">
                    النطاق المسموح:{" "}
                    <span dir="ltr">
                      {(draft.nominal_frequency * (1 - draft.uf_trip_pct / 100)).toFixed(1)}–
                      {(draft.nominal_frequency * (1 + draft.of_trip_pct / 100)).toFixed(1)} Hz
                    </span>
                  </p>
                )}
              </Card>
            ))}

            <Card className="p-4">
              <p className="text-[15px] font-bold text-ink">المنطقة الزمنية</p>
              <p className="mt-0.5 text-[11px] text-muted">
                تحدد منتصف الليل لعدّادات «اليوم» وأوقات السجل.
              </p>
              <input
                dir="ltr"
                disabled={readOnly}
                value={draft.timezone}
                onChange={(e) => set("timezone", e.target.value.trim())}
                className="mt-3 h-11 w-full rounded-2xl border border-line bg-white px-4 text-right text-[14px] outline-none focus:border-brand-500 disabled:bg-canvas"
              />
            </Card>
          </>
        )}
      </div>

      {isAdmin && dirty && (
        <div className="sticky bottom-0 z-30 mt-4 border-t border-line bg-white/95 px-5 pt-3 pb-5 backdrop-blur">
          {formError && (
            <p className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger-strong">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" icon={Save} loading={saving} onClick={save}>
              حفظ ({Object.keys(changed).length})
            </Button>
            <Button
              variant="secondary"
              icon={Undo2}
              onClick={() => {
                setDraft(base);
                setFormError("");
              }}
            >
              تراجع
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberRow({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: NumField;
  value: number | null;
  onChange: (v: number | null) => void;
  readOnly: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const invalid =
    text !== "" &&
    (Number.isNaN(Number(text)) || Number(text) < field.min || Number(text) > field.max);
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">{field.label}</span>
        <span className="text-[11px] text-faint">{field.unit}</span>
      </span>
      <input
        dir="ltr"
        inputMode="decimal"
        disabled={readOnly}
        value={text}
        placeholder={field.optional ? "غير محدد" : undefined}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setText(t);
          if (t === "") onChange(field.optional ? null : (NaN as unknown as number));
          else onChange(Number(t));
        }}
        className={cn(
          "num mt-1 h-11 w-full rounded-2xl border bg-white px-4 text-right text-[14px] outline-none focus:border-brand-500 disabled:bg-canvas",
          invalid ? "border-danger" : "border-line",
        )}
      />
      {field.hint && (
        <span className="mt-1 block text-[11px] leading-5 text-muted">{field.hint}</span>
      )}
      {invalid && (
        <span className="mt-1 block text-[11px] text-danger">
          المسموح من {field.min} إلى {field.max}
        </span>
      )}
    </label>
  );
}
