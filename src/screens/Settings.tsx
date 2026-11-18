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
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { fmtDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import { isValidTimeZone } from "../lib/tz";
import { useActiveDevice } from "../store/devices";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";

type NumKey = {
  [K in keyof EditableSettings]: EditableSettings[K] extends number | null ? K : never;
}[keyof EditableSettings];

interface NumField {
  key: NumKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  optional?: boolean;
  hint?: string;
}

const GROUPS: { title: string; desc: string; fields: NumField[] }[] = [
  {
    title: "حدود الجهد",
    desc: "نسب من الجهد الاسمي. يُفصل المصدر عند تجاوز حد الفصل لمدة المهلة، ولا يعود إلا ضمن حد الرجوع.",
    fields: [
      {
        key: "uv_trip_pct",
        label: "فصل عند انخفاض الجهد",
        unit: "% تحت الاسمي",
        min: 5,
        max: 30,
        step: 0.5,
      },
      {
        key: "uv_recover_pct",
        label: "الرجوع بعد الانخفاض",
        unit: "% تحت الاسمي",
        min: 2,
        max: 29,
        step: 0.5,
      },
      { key: "uv_delay_ms", label: "مهلة الانخفاض", unit: "ms", min: 100, max: 30000, step: 100 },
      {
        key: "ov_trip_pct",
        label: "فصل عند ارتفاع الجهد",
        unit: "% فوق الاسمي",
        min: 3,
        max: 25,
        step: 0.5,
      },
      {
        key: "ov_recover_pct",
        label: "الرجوع بعد الارتفاع",
        unit: "% فوق الاسمي",
        min: 1,
        max: 24,
        step: 0.5,
      },
      { key: "ov_delay_ms", label: "مهلة الارتفاع", unit: "ms", min: 50, max: 10000, step: 50 },
    ],
  },
  {
    title: "حدود التردد",
    desc: "نسب من التردد الاسمي.",
    fields: [
      { key: "uf_trip_pct", label: "فصل عند انخفاض التردد", unit: "%", min: 1, max: 10, step: 0.5 },
      { key: "of_trip_pct", label: "فصل عند ارتفاع التردد", unit: "%", min: 1, max: 10, step: 0.5 },
      { key: "f_recover_pct", label: "نطاق الرجوع", unit: "± %", min: 0.5, max: 9, step: 0.5 },
      { key: "f_delay_ms", label: "مهلة التردد", unit: "ms", min: 100, max: 30000, step: 100 },
    ],
  },
  {
    title: "مؤقتات التحويل",
    desc: "تمنع التحويل المتكرر وتضمن تحويلاً آمناً للأحمال ذات المحركات.",
    fields: [
      {
        key: "return_delay_s",
        label: "مدة الاستقرار قبل العودة",
        unit: "ث",
        min: 30,
        max: 1800,
        hint: "يجب أن يبقى المصدر الأعلى أولوية مستقراً طوال هذه المدة قبل العودة إليه.",
      },
      { key: "min_dwell_s", label: "أقل مدة بقاء على المصدر", unit: "ث", min: 0, max: 1800 },
      {
        key: "neutral_delay_ms",
        label: "فترة التوقف بين الفصل والوصل",
        unit: "ms",
        min: 500,
        max: 3000,
        step: 100,
      },
      {
        key: "transfer_timeout_ms",
        label: "مهلة اعتبار التحويل فاشلاً",
        unit: "ms",
        min: 1000,
        max: 30000,
        step: 500,
      },
      { key: "rate_limit_count", label: "أقصى عدد تحويلات", unit: "تحويل", min: 2, max: 30 },
      {
        key: "rate_limit_window_min",
        label: "خلال",
        unit: "دقيقة",
        min: 1,
        max: 120,
        hint: "عند تجاوز العدد يُثبَّت النظام على أكثر المصادر استقراراً ويُرفع إنذار.",
      },
    ],
  },
  {
    title: "المولد",
    desc: "",
    fields: [
      { key: "gen_crank_attempts", label: "محاولات التشغيل", unit: "محاولة", min: 1, max: 6 },
      { key: "gen_warmup_s", label: "زمن الإحماء", unit: "ث", min: 0, max: 600 },
      { key: "gen_cooldown_s", label: "زمن التبريد بدون حمل", unit: "ث", min: 0, max: 1800 },
    ],
  },
  {
    title: "السعات والتيار",
    desc: "اتركها فارغة إذا لم تكن معروفة.",
    fields: [
      {
        key: "grid_capacity_kw",
        label: "سعة الشبكة",
        unit: "kW",
        min: 0.1,
        max: 999,
        step: 0.1,
        optional: true,
      },
      {
        key: "solar_capacity_kw",
        label: "سعة الإنفرتر الشمسي",
        unit: "kW",
        min: 0.1,
        max: 999,
        step: 0.1,
        optional: true,
      },
      {
        key: "generator_capacity_kw",
        label: "سعة المولد",
        unit: "kW",
        min: 0.1,
        max: 999,
        step: 0.1,
        optional: true,
      },
      {
        key: "max_current_a",
        label: "الحد الأقصى للتيار",
        unit: "A",
        min: 1,
        max: 999,
        step: 0.5,
        optional: true,
      },
    ],
  },
  {
    title: "الوضع اليدوي",
    desc: "",
    fields: [
      {
        key: "manual_revert_min",
        label: "العودة تلقائياً للوضع الذكي بعد",
        unit: "دقيقة",
        min: 5,
        max: 1440,
        optional: true,
        hint: "اتركه فارغاً لإبقاء الوضع اليدوي حتى تغييره يدوياً.",
      },
    ],
  },
];

const EDITABLE_KEYS: (keyof EditableSettings)[] = [
  "priority",
  "nominal_voltage",
  "nominal_frequency",
  ...GROUPS.flatMap((g) => g.fields.map((f) => f.key)),
  "timezone",
];

function validate(d: EditableSettings): string | null {
  for (const g of GROUPS) {
    for (const f of g.fields) {
      const v = d[f.key];
      if (v === null) {
        if (!f.optional) return `«${f.label}» مطلوب.`;
        continue;
      }
      if (!Number.isFinite(v) || v < f.min || v > f.max)
        return `«${f.label}» يجب أن يكون بين ${f.min} و${f.max}.`;
    }
  }
  if (d.uv_recover_pct >= d.uv_trip_pct)
    return "حد الرجوع بعد الانخفاض يجب أن يكون أقرب للاسمي من حد الفصل.";
  if (d.ov_recover_pct >= d.ov_trip_pct)
    return "حد الرجوع بعد الارتفاع يجب أن يكون أقرب للاسمي من حد الفصل.";
  if (d.f_recover_pct >= Math.min(d.uf_trip_pct, d.of_trip_pct))
    return "نطاق رجوع التردد يجب أن يكون أضيق من حدود الفصل.";
  if (!isValidTimeZone(d.timezone)) return "المنطقة الزمنية غير صحيحة (مثال: Asia/Riyadh).";
  return null;
}

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
    const v = validate(draft);
    if (v) return setFormError(v);
    setFormError("");
    setSaving(true);
    const { error: err } = await supabase
      .from("device_settings")
      .update(changed)
      .eq("device_id", device.id);
    setSaving(false);
    if (err) return setFormError(errorMessage(err));
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
                  options={["220", "230", "240"].map((v) => ({
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
                  options={["50", "60"].map((v) => ({
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
                onChange={(p: SourceId[]) => set("priority", p)}
                disabled={readOnly}
              />
            </Card>

            {GROUPS.map((g) => (
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
