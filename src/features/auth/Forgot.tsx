import { Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import * as authApi from "../../api/auth";
import { type View } from "./AuthFlow";
import { BackHeader, EMAIL_RE, FormError, SentScreen } from "./shared";
import { t } from "../../i18n";

export function Forgot({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const em = email.trim().toLowerCase();

  const request = async () => {
    const { error: err } = await authApi.sendPasswordReset(em);
    return err;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!EMAIL_RE.test(em)) return setError(t("صيغة البريد الإلكتروني غير صحيحة"));
    setLoading(true);
    const err = await request();
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (sent) {
    return (
      <SentScreen
        title={t("تحقق من بريدك")}
        body={t("إذا كان هناك حساب مسجّل، فسيصل رابط تعيين كلمة مرور جديدة إلى")}
        email={em}
        onBack={() => onNavigate("login")}
        onResend={request}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <BackHeader
        title={t("استعادة كلمة المرور")}
        subtitle={t("أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.")}
        onBack={() => onNavigate("login")}
      />
      <FormError msg={error} />
      <Field
        label={t("البريد الإلكتروني")}
        icon={Mail}
        type="email"
        ltr
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="lg" full loading={loading}>
        {t("إرسال رابط الاستعادة")}
      </Button>
    </form>
  );
}
