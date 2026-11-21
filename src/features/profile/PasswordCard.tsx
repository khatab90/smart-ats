import { KeyRound, Lock } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Field, Skeleton } from "../../components/ui";
import { accountStatus, changePassword, setPassword } from "../../api/auth";
import { useAuth } from "../../store/auth";
import { Msg } from "./shared";
import { t } from "../../i18n";

/** Changes the password; an account opened only by email links sets its first one. */
export function PasswordCard() {
  const { user } = useAuth();
  // null while asking the server whether the account has a password yet.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user?.email) return;
    void accountStatus(user.email).then(({ data }) =>
      // On a failed check, assume the usual case (a password exists).
      setHasPassword(data === null || data.status === "none" || data.password),
    );
  }, [user?.email]);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (pw.next.length < 8)
      return setMsg({ text: t("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"), tone: "error" });
    if (pw.next !== pw.confirm)
      return setMsg({ text: t("كلمتا المرور غير متطابقتين"), tone: "error" });
    setLoading(true);
    // Re-authenticates first, so a left-open session cannot change the password.
    const { error } = hasPassword
      ? await changePassword(user.email, pw.current, pw.next)
      : await setPassword(pw.next);
    setLoading(false);
    if (error !== null) return setMsg({ text: error, tone: "error" });
    setPw({ current: "", next: "", confirm: "" });
    setMsg({
      text: hasPassword ? t("تم تغيير كلمة المرور") : t("تم تعيين كلمة المرور"),
      tone: "ok",
    });
    setHasPassword(true);
  };

  if (hasPassword === null) return <Skeleton className="h-64" />;

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        {msg && <Msg text={msg.text} tone={msg.tone} />}
        {!hasPassword && !msg && (
          <p className="text-[13px] leading-6 text-muted">
            {t("حسابك ليست له كلمة مرور بعد. عيّن واحدة لتدخل بها بالبريد وكلمة المرور.")}
          </p>
        )}
        {hasPassword && (
          <Field
            label={t("كلمة المرور الحالية")}
            icon={Lock}
            type="password"
            ltr
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
            autoComplete="current-password"
          />
        )}
        <Field
          label={hasPassword ? t("كلمة المرور الجديدة") : t("كلمة المرور")}
          icon={KeyRound}
          type="password"
          ltr
          value={pw.next}
          onChange={(e) => setPw({ ...pw, next: e.target.value })}
          autoComplete="new-password"
        />
        <Field
          label={t("تأكيد كلمة المرور")}
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
          disabled={(hasPassword && !pw.current) || !pw.next}
        >
          {hasPassword ? t("تحديث كلمة المرور") : t("حفظ كلمة المرور")}
        </Button>
      </form>
    </Card>
  );
}
