import { Check, KeyRound, Lock, Mail, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import { cn } from "../../lib/cn";
import * as authApi from "../../api/auth";
import { type View } from "./AuthFlow";
import { BackHeader, EMAIL_RE, FormError, SentScreen, strength } from "./shared";

export function Signup({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const s = strength(form.password);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const email = form.email.trim().toLowerCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.name.trim().length < 3) return setError("أدخل الاسم الكامل");
    if (!EMAIL_RE.test(email)) return setError("صيغة البريد الإلكتروني غير صحيحة");
    if (form.password.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (form.password !== form.confirm) return setError("كلمتا المرور غير متطابقتين");
    if (!agree) return setError("يجب الموافقة على الشروط وسياسة الخصوصية");
    setLoading(true);
    const { data, error: err } = await authApi.signUp(email, form.password, form.name.trim());
    setLoading(false);
    if (err !== null) return setError(err);
    // With email confirmation enabled no session is returned until the link is opened.
    if (!data.signedIn) setSent(true);
  };

  if (sent) {
    return (
      <SentScreen
        title="أكّد بريدك الإلكتروني"
        body="أرسلنا رابط تأكيد الحساب إلى"
        email={email}
        onBack={() => onNavigate("login")}
        onResend={async () => {
          const { error: err } = await authApi.resendConfirmation(email);
          return err;
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <BackHeader
        title="إنشاء حساب"
        subtitle="أنشئ حسابك ثم أضف جهاز Smart ATS الخاص بك."
        onBack={() => onNavigate("login")}
      />
      <FormError msg={error} />
      <Field
        label="الاسم الكامل"
        icon={User}
        value={form.name}
        onChange={set("name")}
        autoComplete="name"
      />
      <Field
        label="البريد الإلكتروني"
        icon={Mail}
        type="email"
        ltr
        placeholder="name@example.com"
        value={form.email}
        onChange={set("email")}
        autoComplete="email"
        hint="يُرسل رابط تأكيد إلى هذا البريد قبل تفعيل الحساب. يمكنك إضافة رقم الهاتف والتحقق منه لاحقاً من الملف الشخصي."
      />
      <div>
        <Field
          label="كلمة المرور"
          icon={Lock}
          type="password"
          ltr
          placeholder="8 أحرف على الأقل"
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
        />
        {form.password && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition",
                    i < s ? (s <= 1 ? "bg-danger" : s <= 2 ? "bg-warn" : "bg-ok") : "bg-line",
                  )}
                />
              ))}
            </div>
            <span className="text-[11px] font-semibold text-muted">
              {s <= 1 ? "ضعيفة" : s <= 2 ? "متوسطة" : "قوية"}
            </span>
          </div>
        )}
      </div>
      <Field
        label="تأكيد كلمة المرور"
        icon={KeyRound}
        type="password"
        ltr
        placeholder="أعد إدخال كلمة المرور"
        value={form.confirm}
        onChange={set("confirm")}
        error={mismatch ? "كلمتا المرور غير متطابقتين" : undefined}
        autoComplete="new-password"
      />
      <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-6 text-ink-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={agree}
          onClick={() => setAgree((a) => !a)}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition",
            agree ? "border-brand-800 bg-brand-800 text-white" : "border-line bg-white",
          )}
        >
          {agree && <Check className="size-3.5" strokeWidth={3} />}
        </button>
        <span onClick={() => setAgree((a) => !a)}>أوافق على شروط الاستخدام وسياسة الخصوصية</span>
      </label>
      <Button type="submit" size="lg" full loading={loading}>
        إنشاء الحساب
      </Button>
      <p className="text-center text-[13px] text-muted">
        لديك حساب بالفعل؟{" "}
        <button
          type="button"
          onClick={() => onNavigate("login")}
          className="font-bold text-brand-700"
        >
          تسجيل الدخول
        </button>
      </p>
    </form>
  );
}
