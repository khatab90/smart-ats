import { MailPlus, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ROLE_META } from "../../data/meta";
import { pushBackHandler } from "../../lib/backStack";
import { clearPendingInvite, usePendingInvite } from "../../lib/invite";
import { AuthLayout } from "./AuthLayout";
import { Forgot } from "./Forgot";
import { Login } from "./Login";
import { Signup } from "./Signup";
import { sameEmail, useInvitePreview } from "./useInvitePreview";
import { t, uiStart } from "../../i18n";

export type View = "login" | "signup" | "forgot";

export function AuthFlow() {
  const [view, setView] = useState<View>("login");
  const hasInvite = Boolean(usePendingInvite());
  const invite = useInvitePreview();
  const inviteEmail = invite?.email;
  // Back from "create account" / "forgot password" returns to sign-in.
  useEffect(
    () =>
      pushBackHandler(() => {
        if (view === "login") return false;
        setView("login");
        return true;
      }),
    [view],
  );
  return (
    <AuthLayout compact={view !== "login" || hasInvite} contentKey={view}>
      {hasInvite && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <MailPlus className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1 text-[13px] leading-6 text-brand-900">
            {invite ? (
              <>
                <p>
                  {invite.inviter_name
                    ? t("«{0}» يدعوك إلى «{1}» بصلاحية {2}.", {
                        0: invite.inviter_name,
                        1: invite.device_name ?? "",
                        2: ROLE_META[invite.role ?? "viewer"].label,
                      })
                    : t("لديك دعوة إلى «{0}» بصلاحية {1}.", {
                        0: invite.device_name ?? "",
                        1: ROLE_META[invite.role ?? "viewer"].label,
                      })}
                </p>
                <p className="mt-1">{t("ادخل أو أنشئ حساباً بالبريد المدعو:")}</p>
                <p className="truncate font-bold" dir="ltr" style={{ textAlign: uiStart() }}>
                  {inviteEmail}
                </p>
              </>
            ) : (
              <p>
                {t(
                  "لديك دعوة للانضمام إلى نظام Smart ATS. سجّل الدخول أو أنشئ حساباً بنفس البريد الإلكتروني الذي وصلته الدعوة لعرض تفاصيلها وقبولها.",
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={clearPendingInvite}
            aria-label={t("تجاهل الدعوة")}
            className="-m-1 rounded-lg p-1 text-brand-700/70 hover:text-brand-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {/* Keyed by the invited email so the form opens with it filled in. */}
      {view === "login" && (
        <Login key={inviteEmail ?? ""} onNavigate={setView} inviteEmail={inviteEmail} />
      )}
      {view === "signup" && (
        <Signup key={inviteEmail ?? ""} onNavigate={setView} inviteEmail={inviteEmail} />
      )}
      {view === "forgot" && <Forgot onNavigate={setView} />}
    </AuthLayout>
  );
}

/** Shown under the email field when it is not the invited address. */
export function InviteEmailWarning({
  email,
  inviteEmail,
}: {
  email: string;
  inviteEmail?: string;
}) {
  if (!inviteEmail || !email.trim() || sameEmail(email, inviteEmail)) return null;
  return (
    <p className="-mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-warn-strong">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {t("الدعوة مرسلة إلى")}{" "}
        <span className="font-semibold break-all" dir="ltr">
          {inviteEmail}
        </span>
        {t("؛ لن تُقبل بهذا البريد.")}
      </span>
    </p>
  );
}
