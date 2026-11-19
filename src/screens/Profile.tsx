import { LogOut, ShieldCheck } from "lucide-react";
import { signInMethods } from "../api/auth";
import { Button, Card, ScreenHeader } from "../components/ui";
import { initialOf } from "../lib/format";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";
import { EmailCard } from "../features/profile/EmailCard";
import { NameCard } from "../features/profile/NameCard";
import { PasswordCard } from "../features/profile/PasswordCard";
import { PhoneCard } from "../features/profile/PhoneCard";
import { t } from "../i18n";

export function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { back } = useNav();
  const { pushToast } = useToast();
  const methods = signInMethods(user);
  // Google-only accounts have no password here; Google manages the email too.
  const hasPassword = methods.includes("email") || methods.length === 0;
  const hasGoogle = methods.includes("google");

  return (
    <div className="pb-10">
      <ScreenHeader title={t("الملف الشخصي")} onBack={back} />
      <div className="space-y-4 px-5">
        <div className="flex flex-col items-center py-2">
          <span className="flex size-20 items-center justify-center rounded-[28px] bg-brand-800 text-3xl font-bold text-white shadow-[0_12px_28px_-12px_rgba(15,45,87,0.8)]">
            {initialOf(profile?.full_name, user?.email)}
          </span>
          <p className="mt-3 text-[17px] font-bold text-ink">
            {profile?.full_name || t("بدون اسم")}
          </p>
          <p className="text-[12px] text-muted" dir="ltr">
            {user?.email}
          </p>
        </div>
        <NameCard
          initial={profile?.full_name ?? ""}
          onSaved={async () => {
            await refreshProfile();
            pushToast({ kind: "success", title: t("تم حفظ الاسم") });
          }}
        />
        {hasGoogle && (
          <Card className="flex items-start gap-3 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" />
            <p className="text-[12px] leading-6 text-ink-2">
              {t("تسجّل الدخول بحساب Google")}
              {hasPassword ? t(" وبكلمة مرور أيضاً.") : "."}{" "}
              {t("الأمان واستعادة الدخول يديرهما حساب Google")}
              {hasPassword ? t(" عند الدخول به.") : t("، فلا توجد كلمة مرور خاصة بالتطبيق.")}
            </p>
          </Card>
        )}
        {hasPassword && <EmailCard />}
        <PhoneCard onVerified={refreshProfile} />
        {hasPassword && <PasswordCard />}
        <Button variant="danger" full icon={LogOut} onClick={() => void signOut()}>
          {t("تسجيل الخروج")}
        </Button>
      </div>
    </div>
  );
}
