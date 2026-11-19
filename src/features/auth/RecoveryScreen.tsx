import { Check, KeyRound, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field } from "../../components/ui";
import * as authApi from "../../api/auth";
import { useAuth } from "../../store/auth";
import { AuthHero } from "./AuthHero";
import { FormError } from "./shared";
import { t } from "../../i18n";

/** Shown after opening a password recovery link. */
export function RecoveryScreen() {
  const { clearRecovery } = useAuth();
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
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar bg-canvas">
      <AuthHero compact />
      <div className="relative -mt-8 flex-1 rounded-t-[32px] bg-canvas px-6 pt-7 pb-8">
        {done ? (
          <div className="flex flex-col items-center pt-4 text-center">
            <span className="flex size-20 items-center justify-center rounded-[28px] bg-ok-soft text-ok">
              <Check className="size-9" />
            </span>
            <h2 className="mt-5 text-[22px] font-bold text-ink">{t("تم تعيين كلمة المرور")}</h2>
            <Button className="mt-8" size="lg" full onClick={clearRecovery}>
              {t("متابعة")}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h2 className="text-[22px] font-bold text-ink">{t("تعيين كلمة مرور جديدة")}</h2>
            <FormError msg={error} />
            <Field
              label={t("كلمة المرور الجديدة")}
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
          </form>
        )}
      </div>
    </div>
  );
}
