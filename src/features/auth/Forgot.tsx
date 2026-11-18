import { Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { appBaseUrl, supabase } from "../../lib/supabase";
import { type View } from "./AuthFlow";
import { BackHeader, EMAIL_RE, FormError, SentScreen } from "./shared";

export function Forgot({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const em = email.trim().toLowerCase();

  const request = async () => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: appBaseUrl(),
    });
    return err ? errorMessage(err) : null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!EMAIL_RE.test(em)) return setError("صيغة البريد الإلكتروني غير صحيحة");
    setLoading(true);
    const err = await request();
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (sent) {
    return (
      <SentScreen
        title="تحقق من بريدك"
        body="إذا كان هناك حساب مسجّل، فسيصل رابط تعيين كلمة مرور جديدة إلى"
        email={em}
        onBack={() => onNavigate("login")}
        onResend={request}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <BackHeader
        title="استعادة كلمة المرور"
        subtitle="أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة."
        onBack={() => onNavigate("login")}
      />
      <FormError msg={error} />
      <Field
        label="البريد الإلكتروني"
        icon={Mail}
        type="email"
        ltr
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="lg" full loading={loading}>
        إرسال رابط الاستعادة
      </Button>
    </form>
  );
}
