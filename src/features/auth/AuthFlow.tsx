import { MailPlus } from "lucide-react";
import { useState } from "react";
import { getPendingInvite } from "../../lib/invite";
import { AuthHero } from "./AuthHero";
import { Forgot } from "./Forgot";
import { Login } from "./Login";
import { Signup } from "./Signup";

export type View = "login" | "signup" | "forgot";

export function AuthFlow() {
  const [view, setView] = useState<View>("login");
  const hasInvite = Boolean(getPendingInvite());
  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar bg-canvas">
      <AuthHero compact={view !== "login" || hasInvite} />
      <div
        key={view}
        className="relative -mt-8 flex-1 animate-fade-in rounded-t-[32px] bg-canvas px-6 pt-7 pb-8"
      >
        {hasInvite && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
            <MailPlus className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <p className="text-[13px] leading-6 text-brand-900">
              لديك دعوة للانضمام إلى نظام Smart ATS. سجّل الدخول أو أنشئ حساباً بنفس البريد الإلكتروني
              الذي وصلته الدعوة لعرض تفاصيلها وقبولها.
            </p>
          </div>
        )}
        {view === "login" && <Login onNavigate={setView} />}
        {view === "signup" && <Signup onNavigate={setView} />}
        {view === "forgot" && <Forgot onNavigate={setView} />}
      </div>
    </div>
  );
}
