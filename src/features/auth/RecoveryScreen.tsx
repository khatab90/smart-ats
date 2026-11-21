import { Check, KeyRound, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import * as authApi from "../../api/auth";
import { useAuth } from "../../store/auth";
import { AuthLayout } from "./AuthLayout";
import { FormError } from "./shared";
import { t } from "../../i18n";

/**
 * Shown after opening a password recovery link, or (`first`) after an email
 * link opened an account that has no password yet, so it can be opened by
 * email and password later. The first password can be left for later.
 */
export function RecoveryScreen({ first = false }: { first?: boolean }) {
  const { clearRecovery, clearFirstPassword } = useAuth();
  const close = first ? clearFirstPassword : clearRecovery;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError(t("كلمة المرور يجب أن تكون 8 أحرف على الأقل"));
    if (password !== confirm) return setError(t("كلمتا المرور غير متطابقتين"));
    setLoading(true);
    const { error: err } = await authApi.setPassword(password);
    setLoading(false);
    if (err !== null) setError(err);
    else setDone(true);
  };

  return (
    <AuthLayout compact>
      {done ? (
        <div className="flex flex-col items-center pt-4 text-center">
          <span className="flex size-20 items-center justify-center rounded-[28px] bg-ok-soft text-ok">
            <Check className="size-9" />
          </span>
          <h2 className="mt-5 text-[22px] font-bold text-ink">{t("تم تعيين كلمة المرور")}</h2>
          <Button className="mt-8" size="lg" full onClick={close}>
            {t("متابعة")}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <h2 className="text-[22px] font-bold text-ink">
              {first ? t("عيّن كلمة مرور لحسابك") : t("تعيين كلمة مرور جديدة")}
            </h2>
            {first && (
              <p className="mt-1 text-[13px] leading-6 text-muted">
                {t("دخلت من رابط البريد. عيّن كلمة مرور لتدخل بها لاحقاً بالبريد وكلمة المرور.")}
              </p>
            )}
          </div>
          <FormError msg={error} />
          <Field
            label={first ? t("كلمة المرور") : t("كلمة المرور الجديدة")}
            icon={Lock}
            type="password"
            ltr
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Field
            label={t("تأكيد كلمة المرور")}
            icon={KeyRound}
            type="password"
            ltr
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <Button type="submit" size="lg" full loading={loading}>
            {t("حفظ كلمة المرور")}
          </Button>
          {first && (
            <Button variant="ghost" full onClick={close}>
              {t("لاحقاً")}
            </Button>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
