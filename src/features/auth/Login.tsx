import { Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import * as authApi from "../../api/auth";
import { InviteEmailWarning, type View } from "./AuthFlow";
import { GoogleSignIn } from "./GoogleButton";
import { FormError } from "./shared";
import { t } from "../../i18n";

export function Login({
  onNavigate,
  inviteEmail,
}: {
  onNavigate: (v: View) => void;
  inviteEmail?: string;
}) {
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    const em = email.trim().toLowerCase();
    if (!em || !password) return setError(t("أدخل البريد الإلكتروني وكلمة المرور"));
    setLoading(true);
    const r = await authApi.signIn(em, password);
    setLoading(false);
    if (r.error !== null) {
      setError(r.error);
      setUnconfirmed(Boolean(r.unconfirmed));
    }
  };

  const resend = async () => {
    const { error: err } = await authApi.resendConfirmation(email.trim().toLowerCase());
    if (err !== null) setError(err);
    else setResent(true);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="mb-1">
        <h2 className="text-[22px] font-bold text-ink">{t("تسجيل الدخول")}</h2>
        <p className="mt-1 text-[13px] text-muted">{t("سجّل الدخول لمتابعة أجهزتك.")}</p>
      </div>
      <GoogleSignIn />
      <FormError msg={error} />
      {unconfirmed && (
        <Button variant="secondary" full onClick={resend} disabled={resent}>
          {resent ? t("تم إرسال رابط التأكيد مجدداً") : t("إعادة إرسال رابط التأكيد")}
        </Button>
      )}
      <Field
        label={t("البريد الإلكتروني")}
        icon={Mail}
        type="email"
        ltr
        autoComplete="email"
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <InviteEmailWarning email={email} inviteEmail={inviteEmail} />
      <div>
        <Field
          label={t("كلمة المرور")}
          icon={Lock}
          type="password"
          ltr
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          onClick={() => onNavigate("forgot")}
          className="mt-2 text-[13px] font-semibold text-brand-600 hover:text-brand-700"
        >
          {t("نسيت كلمة المرور؟")}
        </button>
      </div>
      <Button type="submit" size="lg" full loading={loading}>
        {t("تسجيل الدخول")}
      </Button>
      <p className="pt-2 text-center text-[13px] text-muted">
        {t("ليس لديك حساب؟")}{" "}
        <button
          type="button"
          onClick={() => onNavigate("signup")}
          className="font-bold text-brand-700"
        >
          {t("إنشاء حساب جديد")}
        </button>
      </p>
    </form>
  );
}
