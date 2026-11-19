import { Phone, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, Field, Sheet } from "../../components/ui";
import { requestPhoneChange, verifyPhoneChange } from "../../api/auth";
import { useAuth } from "../../store/auth";
import { useToast } from "../../store/toast";
import { Msg, PHONE_RE } from "./shared";
import { t } from "../../i18n";

export function PhoneCard({ onVerified }: { onVerified: () => Promise<void> }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [otpFor, setOtpFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const { pushToast } = useToast();
  const current = user?.phone ? `+${user.phone.replace(/^\+/, "")}` : null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const ph = phone.replace(/[\s-]/g, "");
    if (!PHONE_RE.test(ph))
      return setError(t("أدخل الرقم بالصيغة الدولية: + ثم رمز الدولة ثم الرقم بدون مسافات"));
    setError("");
    setSending(true);
    const { error: err } = await requestPhoneChange(ph);
    setSending(false);
    if (err !== null) return setError(err);
    setOtpFor(ph);
    setCode("");
    setOtpError("");
  };

  const verify = async () => {
    if (!otpFor) return;
    setVerifying(true);
    const { error: err } = await verifyPhoneChange(otpFor, code.trim());
    setVerifying(false);
    if (err !== null) return setOtpError(err);
    setOtpFor(null);
    setPhone("");
    await onVerified();
    pushToast({ kind: "success", title: t("تم التحقق من رقم الهاتف وحفظه") });
  };

  return (
    <Card className="p-4">
      <form onSubmit={send} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">{t("رقم الهاتف")}</p>
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          {current ? (
            <>
              <ShieldCheck className="size-3.5 text-ok" /> {t("رقم موثّق:")}{" "}
              <span dir="ltr">{current}</span>
            </>
          ) : (
            t("لا يوجد رقم موثّق")
          )}
        </p>
        {error && <Msg text={error} tone="error" />}
        <Field
          label={t("رقم جديد")}
          icon={Phone}
          type="tel"
          ltr
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("+ رمز الدولة ثم الرقم")}
          hint={t("يُرسل رمز تحقق برسالة SMS، ولا يُعتمد الرقم قبل إدخاله.")}
        />
        <Button type="submit" variant="secondary" full loading={sending} disabled={!phone.trim()}>
          {t("إرسال رمز التحقق")}
        </Button>
      </form>
      <Sheet
        open={otpFor !== null}
        onClose={() => setOtpFor(null)}
        title={t("رمز التحقق")}
        footer={
          <Button full loading={verifying} disabled={code.trim().length < 6} onClick={verify}>
            {t("تحقق واحفظ")}
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] text-muted">
            {t("أدخل الرمز المرسل إلى")} <span dir="ltr">{otpFor}</span>
          </p>
          {otpError && <Msg text={otpError} tone="error" />}
          <Field
            label={t("الرمز")}
            ltr
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </div>
      </Sheet>
    </Card>
  );
}
