import { Mail, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, Field } from "../../components/ui";
import { requestEmailChange } from "../../api/auth";
import { useAuth } from "../../store/auth";
import { EMAIL_RE, Msg } from "./shared";

export function EmailCard() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const pending = user?.new_email;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em))
      return setMsg({ text: "صيغة البريد الإلكتروني غير صحيحة", tone: "error" });
    if (em === user?.email) return setMsg({ text: "هذا هو بريدك الحالي", tone: "error" });
    setSaving(true);
    const { error } = await requestEmailChange(em);
    setSaving(false);
    if (error !== null) return setMsg({ text: error, tone: "error" });
    setEmail("");
    setMsg({ text: `أرسلنا رابط تأكيد إلى ${em}. لن يتغير بريدك قبل فتح الرابط.`, tone: "ok" });
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">البريد الإلكتروني</p>
        <p className="text-[12px] text-muted">
          الحالي: <span dir="ltr">{user?.email}</span>
        </p>
        {pending && (
          <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[12px] text-brand-800">
            <MailCheck className="size-4" /> بانتظار تأكيد البريد الجديد{" "}
            <span dir="ltr">{pending}</span>
          </p>
        )}
        {msg && <Msg text={msg.text} tone={msg.tone} />}
        <Field
          label="البريد الجديد"
          icon={Mail}
          type="email"
          ltr
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
        <Button type="submit" variant="secondary" full loading={saving} disabled={!email.trim()}>
          إرسال رابط التحقق
        </Button>
      </form>
    </Card>
  );
}
