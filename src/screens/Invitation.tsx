import { CircleAlert, LogOut, MailPlus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, ErrorState, Skeleton } from "../components/ui";
import { ROLE_META } from "../data/meta";
import type { Role } from "../data/types";
import { errorMessage } from "../lib/errors";
import { fmtDateTime } from "../lib/format";
import { clearPendingInvite } from "../lib/invite";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { useDevices } from "../store/devices";
import { useToast } from "../store/toast";

interface InviteInfo {
  status: "pending" | "accepted" | "revoked" | "expired" | "invalid";
  device_id?: string;
  device_name?: string;
  role?: Role;
  email?: string;
  inviter_name?: string | null;
  expires_at?: string;
  email_matches?: boolean;
}

const STATUS_TEXT: Record<Exclude<InviteInfo["status"], "pending">, string> = {
  accepted: "تم استخدام هذه الدعوة بالفعل.",
  revoked: "ألغى المسؤول هذه الدعوة.",
  expired: "انتهت صلاحية هذه الدعوة. اطلب من المسؤول إعادة إرسالها.",
  invalid: "رابط الدعوة غير صالح.",
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
    const { data, error: err } = await supabase.rpc("get_invitation", { p_token: token });
    if (err) setError(errorMessage(err));
    else setInfo(data as InviteInfo);
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
    const { data, error: err } = await supabase.rpc("accept_invitation", { p_token: token });
    setBusy(false);
    if (err) return setError(errorMessage(err));
    const res = data as { device_id: string };
    await refresh();
    setActiveId(res.device_id);
    pushToast({
      kind: "success",
      title: "تم قبول الدعوة",
      body: `أصبح لديك وصول إلى «${info?.device_name ?? res.device_id}».`,
    });
    finish();
  };

  return (
    <div className="no-scrollbar flex h-full flex-col overflow-y-auto bg-canvas px-5 pt-10 pb-8">
      <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600">
        <MailPlus className="size-7" />
      </span>
      <h1 className="mt-4 text-center text-xl font-bold text-ink">دعوة للانضمام</h1>
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
              {info.inviter_name ? `يدعوك «${info.inviter_name}»` : "تمت دعوتك"} للوصول إلى نظام
              ATS:
            </p>
            <p className="text-[18px] font-bold text-ink">{info.device_name}</p>
            <div className="flex items-center gap-2 rounded-2xl bg-canvas p-3">
              <ShieldCheck className="size-5 text-brand-600" />
              <div>
                <p className="text-[13px] font-semibold text-ink">
                  الصلاحية: {ROLE_META[info.role ?? "viewer"].label}
                </p>
                <p className="text-[12px] text-muted">{ROLE_META[info.role ?? "viewer"].desc}</p>
              </div>
            </div>
            <p className="num text-[12px] text-muted">
              صالحة حتى {info.expires_at ? fmtDateTime(Date.parse(info.expires_at)) : "—"} • مرسلة
              إلى <span dir="ltr">{info.email}</span>
            </p>
            {info.email_matches ? (
              <Button full size="lg" loading={busy} onClick={accept}>
                قبول الدعوة
              </Button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-warn/30 bg-warn-soft p-4">
                <p className="text-[13px] leading-6 text-warn-strong">
                  أنت مسجّل الدخول بالبريد <span dir="ltr">{user?.email}</span>. الدعوة مرسلة إلى
                  بريد آخر؛ سجّل الخروج ثم ادخل بالبريد المدعو.
                </p>
                <Button full variant="outline" icon={LogOut} onClick={() => void signOut()}>
                  تسجيل الخروج
                </Button>
              </div>
            )}
          </Card>
        )}
        <Button full variant="ghost" onClick={finish}>
          {info?.status === "pending" ? "ليس الآن" : "متابعة"}
        </Button>
      </div>
    </div>
  );
}
