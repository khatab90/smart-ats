import { Bluetooth, Check, Hash, KeyRound, Router, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, Field } from "../components/ui";
import { claimDevice } from "../api/devices";
import { APP_ENV } from "../config/supabase";
import { errorMessage } from "../lib/errors";
import { useDevices } from "../store/devices";

/**
 * Claims a factory-registered board with its Device ID and the PIN printed
 * on it (proof of possession, verified on the server). Bluetooth Wi-Fi
 * provisioning is deferred to a native app.
 */
export function AddDevice({ onClose }: { onClose: () => void }) {
  const { refresh, setActiveId } = useDevices();
  const [deviceId, setDeviceId] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const id = deviceId.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(id))
      return setError("معرّف الجهاز غير صالح. انسخه كما هو مطبوع على البورد.");
    if (pin.trim().length < 6) return setError("رمز PIN يتكون من 6 أرقام على الأقل.");
    if (name.trim().length < 2) return setError("أدخل اسماً للجهاز.");
    setLoading(true);
    const { data: res, error: err } = await claimDevice({
      deviceId: id,
      pin: pin.trim(),
      environment: APP_ENV,
      name: name.trim(),
      location: location.trim() || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setLoading(false);
    if (err !== null) return setError(err);
    if (!res.ok) return setError(errorMessage(res.error ?? ""));
    await refresh();
    setActiveId(res.device_id ?? id);
    setDone(res.device_id ?? id);
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted">إضافة جهاز</p>
          <h1 className="text-xl font-bold text-ink">
            {done ? "تمت إضافة الجهاز" : "ربط بورد Smart ATS"}
          </h1>
        </div>
        {!done && (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex size-10 items-center justify-center rounded-2xl border border-line bg-surface text-ink-2"
          >
            <X className="size-5" />
          </button>
        )}
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pt-2 pb-6">
        {done ? (
          <div className="flex flex-col items-center pt-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-[28px] bg-ok text-white shadow-[0_16px_32px_-12px_rgba(18,183,106,0.7)]">
              <Check className="size-10" strokeWidth={2.5} />
            </span>
            <p className="mt-4 text-[13px] text-muted">تم ربط الجهاز بحسابك كمالك ومسؤول:</p>
            <p
              className="num mt-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-5 py-2.5 text-xl font-bold tracking-wider text-brand-800"
              dir="ltr"
            >
              {done}
            </p>
            <p className="mt-4 max-w-[300px] text-[12px] leading-6 text-muted">
              ستظهر الحالة والقراءات فور وصول أول بيانات من البورد. أكمل إعدادات الجهاز (الجهد
              والتردد الاسميين) من «المزيد ← إعدادات الجهاز».
            </p>
          </div>
        ) : (
          <form id="claim" onSubmit={submit} className="space-y-4" noValidate>
            <Card className="flex items-start gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Router className="size-5" />
              </span>
              <p className="text-[12px] leading-6 text-ink-2">
                أدخل معرّف الجهاز (Device ID) ورمز PIN المطبوعين على ملصق البورد. يتحقق الخادم من
                الرمز لإثبات حيازتك للجهاز، ولا يمكن إضافة جهاز مسجّل لحساب آخر.
              </p>
            </Card>
            {error && (
              <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[13px] font-medium text-danger-strong">
                {error}
              </p>
            )}
            <Field
              label="معرّف الجهاز (Device ID)"
              icon={Hash}
              ltr
              placeholder="ATS-XXXXXX"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
              autoCapitalize="characters"
            />
            <Field
              label="رمز PIN"
              icon={KeyRound}
              type="password"
              ltr
              inputMode="numeric"
              placeholder="••••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\s/g, ""))}
            />
            <Field
              label="اسم الجهاز"
              placeholder="مثال: المنزل"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="الموقع (اختياري)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
              <Bluetooth className="mt-0.5 size-5 shrink-0 text-faint" />
              <p className="text-[11px] leading-5 text-muted">
                إعداد شبكة Wi-Fi للبورد عبر Bluetooth غير متاح في نسخة الويب، وينتظر التطبيق الأصلي.
                يجب أن يكون البورد متصلاً بالإنترنت ليرسل بياناته بعد الإضافة.
              </p>
            </div>
          </form>
        )}
      </div>

      <div className="border-t border-line bg-surface/80 px-5 pt-3 pb-5 backdrop-blur">
        {done ? (
          <Button size="lg" full onClick={onClose}>
            الذهاب إلى لوحة التحكم
          </Button>
        ) : (
          <Button size="lg" full type="submit" form="claim" loading={loading}>
            إضافة الجهاز
          </Button>
        )}
      </div>
    </div>
  );
}
