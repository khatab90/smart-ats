import { KeyRound, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { signInMethods } from "../api/auth";
import { Card, ConfirmDialog, Row, RowGroup, ScreenHeader } from "../components/ui";
import { ltr } from "../features/settings/summaries";
import { initialOf } from "../lib/format";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { t } from "../i18n";

/** Google-only accounts have no password here; Google manages the email too. */
export function useSignInMethods() {
  const { user } = useAuth();
  const methods = signInMethods(user);
  return {
    hasPassword: methods.includes("email") || methods.length === 0,
    hasGoogle: methods.includes("google"),
  };
}

/** Profile: account details as a list, each opening its own screen. */
export function Profile() {
  const { user, profile, signOut } = useAuth();
  const { back, push } = useNav();
  const { hasPassword, hasGoogle } = useSignInMethods();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="pb-10">
      <ScreenHeader title={t("الملف الشخصي")} onBack={back} />
      <div className="space-y-5 px-5">
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

        <RowGroup title={t("المعلومات الشخصية")}>
          <Row
            icon={UserRound}
            title={t("الاسم")}
            subtitle={profile?.full_name || t("غير مضاف")}
            onClick={() => push("profile.name")}
          />
          {hasPassword && (
            <Row
              icon={Mail}
              title={t("البريد الإلكتروني")}
              subtitle={user?.new_email ? t("بانتظار تأكيد البريد الجديد") : ltr(user?.email ?? "")}
              onClick={() => push("profile.email")}
            />
          )}
        </RowGroup>

        <RowGroup title={t("الأمان")}>
          {hasPassword && (
            <Row
              icon={KeyRound}
              title={t("كلمة المرور")}
              subtitle={t("تغيير كلمة المرور")}
              onClick={() => push("profile.password")}
            />
          )}
          {hasGoogle && (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok">
                <ShieldCheck className="size-[19px]" strokeWidth={1.8} />
              </span>
              <p className="text-[12px] leading-6 text-ink-2">
                {t("تسجّل الدخول بحساب Google")}
                {hasPassword ? t(" وبكلمة مرور أيضاً.") : "."}{" "}
                {t("الأمان واستعادة الدخول يديرهما حساب Google")}
                {hasPassword ? t(" عند الدخول به.") : t("، فلا توجد كلمة مرور خاصة بالتطبيق.")}
              </p>
            </div>
          )}
        </RowGroup>

        <Card
          onClick={() => setSigningOut(true)}
          className="flex items-center justify-center gap-2 border-danger/20 py-3.5 text-[14px] font-bold text-danger"
        >
          <LogOut className="size-[18px]" /> {t("تسجيل الخروج")}
        </Card>
      </div>

      <ConfirmDialog
        open={signingOut}
        onClose={() => setSigningOut(false)}
        icon={LogOut}
        danger
        title={t("تسجيل الخروج؟")}
        confirmLabel={t("تسجيل الخروج")}
        onConfirm={() => {
          setSigningOut(false);
          void signOut();
        }}
      >
        <p className="text-center text-[13px] leading-6 text-ink-2">
          {t("ستحتاج إلى تسجيل الدخول مرة أخرى لمتابعة أجهزتك.")}
        </p>
      </ConfirmDialog>
    </div>
  );
}
