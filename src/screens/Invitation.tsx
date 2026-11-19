import { CircleAlert, LogOut, MailPlus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, ErrorState, Skeleton } from "../components/ui";
import { ROLE_META } from "../data/meta";
import { fmtDateTime } from "../lib/format";
import { clearPendingInvite } from "../lib/invite";
import { acceptInvitation, getInvitation, type InvitationInfo } from "../api/members";
import { useAuth } from "../store/auth";
import { useDevices } from "../store/devices";
import { useToast } from "../store/toast";
import { t } from "../i18n";

type InviteInfo = InvitationInfo;

const STATUS_TEXT: Record<Exclude<InviteInfo["status"], "pending">, string> = {
  accepted: t("تم استخدام هذه الدعوة بالفعل."),
  revoked: t("ألغى المسؤول هذه الدعوة."),
  expired: t("انتهت صلاحية هذه الدعوة. اطلب من المسؤول إعادة إرسالها."),
  invalid: t("رابط الدعوة غير صالح."),
};

export function InvitationScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { user, signOut } = useAuth();
  const { refresh, setActiveId } = useDevices();
  const { pushToast } = useToast();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error: err } = await getInvitation(token);
    if (err !== null) setError(err);
    else setInfo(data);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const finish = () => {
    clearPendingInvite();
    onDone();
  };

  const accept = async () => {
    setBusy(true);
    const { data: res, error: err } = await acceptInvitation(token);
    setBusy(false);
    if (err !== null) return setError(err);
    await refresh();
    setActiveId(res.device_id);
    pushToast({
      kind: "success",
      title: t("تم قبول الدعوة"),
      body: t("أصبح لديك وصول إلى «{0}».", { 0: info?.device_name ?? res.device_id }),
    });
    finish();
  };

  return (
    <div className="no-scrollbar flex h-full flex-col overflow-y-auto bg-canvas px-5 pt-10 pb-8">
      <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600">
        <MailPlus className="size-7" />
      </span>
      <h1 className="mt-4 text-center text-xl font-bold text-ink">{t("دعوة للانضمام")}</h1>
      <div className="mt-6 space-y-4">
        {error && <ErrorState message={error} onRetry={load} />}
        {!info && !error && <Skeleton className="h-40" />}
        {info && info.status !== "pending" && (
          <Card className="p-5 text-center">
            <CircleAlert className="mx-auto size-8 text-warn" />
            <p className="mt-3 text-[14px] font-semibold text-ink">{STATUS_TEXT[info.status]}</p>
          </Card>
        )}
        {info && info.status === "pending" && (
          <Card className="space-y-3 p-5">
            <p className="text-[13px] text-muted">
              {info.inviter_name ? t("يدعوك «{0}»", { 0: info.inviter_name }) : t("تمت دعوتك")}{" "}
              {t("للوصول إلى نظام ATS:")}
            </p>
            <p className="text-[18px] font-bold text-ink">{info.device_name}</p>
            <div className="flex items-center gap-2 rounded-2xl bg-canvas p-3">
              <ShieldCheck className="size-5 text-brand-600" />
              <div>
                <p className="text-[13px] font-semibold text-ink">
                  {t("الصلاحية:")} {ROLE_META[info.role ?? "viewer"].label}
                </p>
                <p className="text-[12px] text-muted">{ROLE_META[info.role ?? "viewer"].desc}</p>
              </div>
            </div>
            <p className="num text-[12px] text-muted">
              {t("صالحة حتى")} {info.expires_at ? fmtDateTime(Date.parse(info.expires_at)) : "—"}{" "}
              {t("• مرسلة إلى")} <span dir="ltr">{info.email}</span>
            </p>
            {info.email_matches ? (
              <Button full size="lg" loading={busy} onClick={accept}>
                {t("قبول الدعوة")}
              </Button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-warn/30 bg-warn-soft p-4">
                <p className="text-[13px] leading-6 text-warn-strong">
                  {t("أنت مسجّل الدخول بالبريد")} <span dir="ltr">{user?.email}</span>
                  {t(". الدعوة مرسلة إلى بريد آخر؛ سجّل الخروج ثم ادخل بالبريد المدعو.")}
                </p>
                <Button full variant="outline" icon={LogOut} onClick={() => void signOut()}>
                  {t("تسجيل الخروج")}
                </Button>
              </div>
            )}
          </Card>
        )}
        <Button full variant="ghost" onClick={finish}>
          {info?.status === "pending" ? t("ليس الآن") : t("متابعة")}
        </Button>
      </div>
    </div>
  );
}
