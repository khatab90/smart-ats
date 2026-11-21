import { Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import * as authApi from "../../api/auth";
import { signInProblem, type SignInProblem } from "../../domain/account";
import { InviteEmailWarning, type Navigate } from "./AuthFlow";
import { GoogleSignIn } from "./GoogleButton";
import { FormError, Notice } from "./shared";
import { t } from "../../i18n";

const PROBLEM_TEXT: Record<SignInProblem, string> = {
  no_account: t("لا يوجد حساب بهذا البريد. أنشئ حساباً جديداً به."),
  unconfirmed: t("هذا الحساب لم يُؤكَّد بعد. افتح رابط التأكيد المرسل إلى بريدك."),
  no_password: t(
    "هذا الحساب ليست له كلمة مرور بعد، لأنه أُنشئ من رابط دعوة. أرسل لنفسك رابطاً لتعيين كلمة مرور.",
  ),
  google: t("هذا الحساب يدخل بحساب Google. استخدم زر Google بالأعلى، أو عيّن كلمة مرور له."),
  wrong_password: t("كلمة المرور غير صحيحة."),
};

export function Login({
  onNavigate,
  inviteEmail,
  startEmail,
}: {
  onNavigate: Navigate;
  inviteEmail?: string;
  startEmail: string;
}) {
  const [email, setEmail] = useState(startEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const em = email.trim().toLowerCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setProblem(null);
    setSent("");
    if (!em || !password) return setError(t("أدخل البريد الإلكتروني وكلمة المرور"));
    setLoading(true);
    const r = await authApi.signIn(em, password);
    if (r.error === null) return setLoading(false);
    // "Email or password incorrect" hides what to do next; ask what the account is.
    const status = r.refused || r.unconfirmed ? await authApi.accountStatus(em) : null;
    setLoading(false);
    if (status?.error === null) setProblem(signInProblem(status.data));
    else setError(r.unconfirmed ? PROBLEM_TEXT.unconfirmed : r.error);
  };

  /** Sends a confirmation link again, or a link that sets a (first) password. */
  const sendLink = async (kind: "confirm" | "password") => {
    setSending(true);
    const { error: err } =
      kind === "confirm"
        ? await authApi.resendConfirmation(em)
        : await authApi.sendPasswordReset(em);
    setSending(false);
    if (err !== null) return setError(err);
    setSent(
      kind === "confirm"
        ? t("أُرسل رابط التأكيد إلى بريدك. إن لم تجده فافحص الرسائل غير المرغوب بها.")
        : t("أُرسل رابط تعيين كلمة المرور إلى بريدك. إن لم تجده فافحص الرسائل غير المرغوب بها."),
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="mb-1">
        <h2 className="text-[22px] font-bold text-ink">{t("تسجيل الدخول")}</h2>
        <p className="mt-1 text-[13px] text-muted">{t("سجّل الدخول لمتابعة أجهزتك.")}</p>
      </div>
      <GoogleSignIn />
      <FormError msg={error} />
      {problem && (
        <Notice
          tone={problem === "wrong_password" ? "danger" : "warn"}
          text={PROBLEM_TEXT[problem]}
        >
          {sent ? (
            <p className="text-[12px] leading-5 font-semibold text-ok">{sent}</p>
          ) : problem === "no_account" ? (
            <Button full size="sm" onClick={() => onNavigate("signup", em)}>
              {t("إنشاء حساب بهذا البريد")}
            </Button>
          ) : problem === "unconfirmed" ? (
            <Button
              full
              size="sm"
              variant="outline"
              loading={sending}
              onClick={() => sendLink("confirm")}
            >
              {t("إعادة إرسال رابط التأكيد")}
            </Button>
          ) : problem === "wrong_password" ? null : (
            <Button
              full
              size="sm"
              variant="outline"
              loading={sending}
              onClick={() => sendLink("password")}
            >
              {t("أرسل رابط تعيين كلمة المرور")}
            </Button>
          )}
        </Notice>
      )}
      <Field
        label={t("البريد الإلكتروني")}
        icon={Mail}
        type="email"
        ltr
        autoComplete="email"
        placeholder="name@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setProblem(null);
        }}
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
          onClick={() => onNavigate("forgot", em)}
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
          onClick={() => onNavigate("signup", em)}
          className="font-bold text-brand-700"
        >
          {t("إنشاء حساب جديد")}
        </button>
      </p>
    </form>
  );
}
