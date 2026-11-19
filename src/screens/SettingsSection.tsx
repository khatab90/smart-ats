import { Info, Save, Settings2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { PriorityList } from "../components/control";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ScreenHeader,
  Segmented,
  Skeleton,
} from "../components/ui";
import { SOURCE_META } from "../data/meta";
import type { EditableSettings, SourceId } from "../data/types";
import { describePeriod } from "../domain/schedule";
import {
  NOMINAL_FREQUENCIES,
  NOMINAL_VOLTAGES,
  SETTINGS_GROUPS,
  type NumField,
} from "../domain/settings";
import { installedSources } from "../domain/sources";
import { SECTION_META } from "../features/settings/sections";
import { SolarScheduleEditor } from "../features/settings/SolarScheduleEditor";
import { frequencyRange, voltageRange } from "../features/settings/summaries";
import { useSettingsForm } from "../features/settings/useSettingsForm";
import { cn } from "../lib/cn";
import { useActiveDevice } from "../store/devices";
import { useNav, type SettingsSection } from "../store/nav";
import { t } from "../i18n";

type Setter = <K extends keyof EditableSettings>(k: K, v: EditableSettings[K]) => void;

/** One device-settings section on its own screen, with its own save. */
export function SettingsSectionScreen({ section }: { section: SettingsSection }) {
  const { device, status, loading } = useActiveDevice();
  const { back } = useNav();
  const form = useSettingsForm();
  const { draft, set, readOnly } = form;
  const [leaving, setLeaving] = useState(false);
  const meta = SECTION_META[section];

  const close = () => (form.dirty ? setLeaving(true) : back());
  const save = async () => {
    if (await form.save()) back();
  };

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title={meta.title}
        subtitle={device ? device.name || device.id : undefined}
        onBack={close}
      />
      <div className="flex-1 space-y-4 px-5 pb-6">
        {!device ? (
          <EmptyState icon={Settings2} title={t("لا يوجد جهاز")} body={t("أضف جهازاً أولاً.")} />
        ) : loading || !draft ? (
          <Skeleton className="h-72" />
        ) : (
          <>
            {readOnly && (
              <p className="rounded-2xl bg-surface px-4 py-3 text-[12px] text-muted">
                {t("صلاحيتك «مشاهد»: الإعدادات للعرض فقط.")}
              </p>
            )}
            <SectionBody
              section={section}
              draft={draft}
              set={set}
              readOnly={readOnly}
              installed={installedSources(status)}
            />
          </>
        )}
      </div>

      {!readOnly && form.dirty && (
        <div className="sticky bottom-0 z-30 border-t border-line bg-surface/95 px-5 pt-3 pb-5 backdrop-blur">
          {form.formError && (
            <p className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger-strong">
              {form.formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" icon={Save} loading={form.saving} onClick={save}>
              {t("حفظ التغييرات")}
            </Button>
            <Button variant="secondary" onClick={form.discard}>
              {t("تراجع")}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        icon={TriangleAlert}
        danger
        title={t("تجاهل التغييرات؟")}
        confirmLabel={t("تجاهل")}
        onConfirm={() => {
          setLeaving(false);
          form.discard();
          back();
        }}
      >
        <p className="text-center text-[13px] leading-6 text-ink-2">
          {t("لم تحفظ التغييرات على «{0}». إذا خرجت الآن ستُفقد.", { 0: meta.title })}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "solar" }) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-2xl px-3.5 py-3 text-[12px] leading-6",
        tone === "solar" ? "bg-solar-soft text-ink-2" : "bg-surface text-muted",
      )}
    >
      <Info className="mt-1 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function SectionBody({
  section,
  draft,
  set,
  readOnly,
  installed,
}: {
  section: SettingsSection;
  draft: EditableSettings;
  set: Setter;
  readOnly: boolean;
  installed: SourceId[];
}) {
  switch (section) {
    case "priority":
      return (
        <>
          <Card className="p-4">
            <PriorityList
              value={draft.priority}
              installed={installed}
              onChange={(p: SourceId[]) => set("priority", p)}
              disabled={readOnly}
            />
          </Card>
          <Note>
            {readOnly ? "" : t("اسحب المصادر أو استخدم الأسهم لإعادة ترتيبها. ")}
            {t(
              "في الوضع الذكي يعتمد البورد على المصدر الأول إذا كان مستوفياً لشروط التشغيل، وإلا ينتقل إلى التالي، ويعود إلى الأعلى أولوية بعد استقراره.",
            )}
          </Note>
          {draft.solar_schedule.enabled && installed.includes("solar") && (
            <Note tone="solar">
              <b>{SOURCE_META.solar.name}</b> {t("تُستخدم في الوضع الذكي فقط في:")}{" "}
              {draft.solar_schedule.periods.map(describePeriod).join(t("، "))}
            </Note>
          )}
        </>
      );
    case "solar":
      return (
        <SolarScheduleEditor
          value={draft.solar_schedule}
          onChange={(v) => set("solar_schedule", v)}
          timezone={draft.timezone}
          disabled={readOnly}
        />
      );
    case "nominal":
      return (
        <>
          <Card className="space-y-4 p-4">
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink-2">{t("الجهد الاسمي")}</p>
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
              <p className="mb-1.5 text-[12px] font-medium text-ink-2">{t("التردد الاسمي")}</p>
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
          </Card>
          <Note>{t("حسب شبكة موقع التركيب. حدود الجهد والتردد تُحسب كنسب من هذه القيم.")}</Note>
        </>
      );
    case "timezone":
      return (
        <>
          <Card className="p-4">
            <input
              dir="ltr"
              disabled={readOnly}
              value={draft.timezone}
              onChange={(e) => set("timezone", e.target.value.trim())}
              aria-label={t("المنطقة الزمنية")}
              className="h-11 w-full rounded-2xl border border-line bg-surface px-4 text-start text-[14px] outline-none focus:border-brand-500 disabled:bg-canvas"
            />
          </Card>
          <Note>{t("تحدد منتصف الليل لعدّادات «اليوم» وأوقات السجل. مثال: Asia/Baghdad")}</Note>
        </>
      );
    default: {
      const g = SETTINGS_GROUPS.find((x) => x.id === section);
      if (!g) return null;
      const range =
        section === "voltage"
          ? voltageRange(draft)
          : section === "frequency"
            ? frequencyRange(draft)
            : null;
      return (
        <>
          {g.desc && <Note>{g.desc}</Note>}
          <Card className="space-y-4 p-4">
            {g.fields.map((f) => (
              <NumberRow
                key={f.key}
                field={f}
                value={draft[f.key]}
                readOnly={readOnly}
                onChange={(v) => set(f.key, v as never)}
              />
            ))}
          </Card>
          {range && (
            <p className="num rounded-2xl bg-ok-soft/60 px-4 py-3 text-[12px] font-semibold text-ok-strong">
              {t("النطاق المسموح:")} {range}
            </p>
          )}
        </>
      );
    }
  }
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
        placeholder={field.optional ? t("غير محدد") : undefined}
        onChange={(e) => {
          const next = e.target.value.replace(",", ".");
          setText(next);
          if (next === "") onChange(field.optional ? null : (NaN as unknown as number));
          else onChange(Number(next));
        }}
        className={cn(
          "num mt-1 h-11 w-full rounded-2xl border bg-surface px-4 text-start text-[14px] outline-none focus:border-brand-500 disabled:bg-canvas",
          invalid ? "border-danger" : "border-line",
        )}
      />
      {field.hint && (
        <span className="mt-1 block text-[11px] leading-5 text-muted">{field.hint}</span>
      )}
      {invalid && (
        <span className="mt-1 block text-[11px] text-danger">
          {t("المسموح من {0} إلى {1}", { 0: field.min, 1: field.max })}
        </span>
      )}
    </label>
  );
}
