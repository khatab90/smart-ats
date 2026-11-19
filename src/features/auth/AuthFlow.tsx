import { MailPlus } from "lucide-react";
import { useState } from "react";
import { getPendingInvite } from "../../lib/invite";
import { AuthLayout } from "./AuthLayout";
import { Forgot } from "./Forgot";
import { Login } from "./Login";
import { Signup } from "./Signup";
import { t } from "../../i18n";

export type View = "login" | "signup" | "forgot";

export function AuthFlow() {
  const [view, setView] = useState<View>("login");
  const hasInvite = Boolean(getPendingInvite());
  return (
    <AuthLayout compact={view !== "login" || hasInvite} contentKey={view}>
      {hasInvite && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <MailPlus className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <p className="text-[13px] leading-6 text-brand-900">
            {t(
              "لديك دعوة للانضمام إلى نظام Smart ATS. سجّل الدخول أو أنشئ حساباً بنفس البريد الإلكتروني الذي وصلته الدعوة لعرض تفاصيلها وقبولها.",
            )}
          </p>
        </div>
      )}
      {view === "login" && <Login onNavigate={setView} />}
      {view === "signup" && <Signup onNavigate={setView} />}
      {view === "forgot" && <Forgot onNavigate={setView} />}
    </AuthLayout>
  );
}
