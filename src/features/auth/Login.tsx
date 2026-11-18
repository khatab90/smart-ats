import { Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import * as authApi from "../../api/auth";
import { type View } from "./AuthFlow";
import { FormError } from "./shared";

export function Login({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [email, setEmail] = useState("");
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
    if (!em || !password) return setError("أدخل البريد الإلكتروني وكلمة المرور");
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
        <h2 className="text-[22px] font-bold text-ink">تسجيل الدخول</h2>
        <p className="mt-1 text-[13px] text-muted">سجّل الدخول لمتابعة أجهزتك.</p>
      </div>
      <FormError msg={error} />
      {unconfirmed && (
        <Button variant="secondary" full onClick={resend} disabled={resent}>
          {resent ? "تم إرسال رابط التأكيد مجدداً" : "إعادة إرسال رابط التأكيد"}
        </Button>
      )}
      <Field
        label="البريد الإلكتروني"
        icon={Mail}
        type="email"
        ltr
        autoComplete="email"
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div>
        <Field
          label="كلمة المرور"
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
          نسيت كلمة المرور؟
        </button>
      </div>
      <Button type="submit" size="lg" full loading={loading}>
        تسجيل الدخول
      </Button>
      <p className="pt-2 text-center text-[13px] text-muted">
        ليس لديك حساب؟{" "}
        <button
          type="button"
          onClick={() => onNavigate("signup")}
          className="font-bold text-brand-700"
        >
          إنشاء حساب جديد
        </button>
      </p>
    </form>
  );
}
