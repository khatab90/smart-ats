import { KeyRound, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, Field } from "../../components/ui";
import { changePassword } from "../../api/auth";
import { useAuth } from "../../store/auth";
import { Msg } from "./shared";

export function PasswordCard() {
  const { user } = useAuth();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (pw.next.length < 8)
      return setMsg({ text: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل", tone: "error" });
    if (pw.next !== pw.confirm)
      return setMsg({ text: "كلمتا المرور غير متطابقتين", tone: "error" });
    setLoading(true);
    // Re-authenticates first, so a left-open session cannot change the password.
    const { error } = await changePassword(user.email, pw.current, pw.next);
    setLoading(false);
    if (error !== null) return setMsg({ text: error, tone: "error" });
    setPw({ current: "", next: "", confirm: "" });
    setMsg({ text: "تم تغيير كلمة المرور", tone: "ok" });
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">تغيير كلمة المرور</p>
        {msg && <Msg text={msg.text} tone={msg.tone} />}
        <Field
          label="كلمة المرور الحالية"
          icon={Lock}
          type="password"
          ltr
          value={pw.current}
          onChange={(e) => setPw({ ...pw, current: e.target.value })}
          autoComplete="current-password"
        />
        <Field
          label="كلمة المرور الجديدة"
          icon={KeyRound}
          type="password"
          ltr
          value={pw.next}
          onChange={(e) => setPw({ ...pw, next: e.target.value })}
          autoComplete="new-password"
        />
        <Field
          label="تأكيد كلمة المرور"
          icon={KeyRound}
          type="password"
          ltr
          value={pw.confirm}
          onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          autoComplete="new-password"
        />
        <Button
          type="submit"
          variant="secondary"
          full
          loading={loading}
          disabled={!pw.current || !pw.next}
        >
          تحديث كلمة المرور
        </Button>
      </form>
    </Card>
  );
}
