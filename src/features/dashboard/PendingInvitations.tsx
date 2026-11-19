import { MailPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { acceptMyInvitation, listMyInvitations, type MyInvitation } from "../../api/members";
import { Button, Card } from "../../components/ui";
import { ROLE_META } from "../../data/meta";
import { useAuth } from "../../store/auth";
import { useDevices } from "../../store/devices";
import { useToast } from "../../store/toast";

/**
 * Invitations sent to the signed-in user's verified email. Someone who signs
 * in with Google (or never opened the invitation email) still sees them here.
 */
export function PendingInvitations() {
  const { user } = useAuth();
  const { refresh, setActiveId } = useDevices();
  const { pushToast } = useToast();
  const [items, setItems] = useState<MyInvitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void listMyInvitations().then(({ data }) => alive && data && setItems(data));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!items.length) return null;

  const accept = async (inv: MyInvitation) => {
    setError("");
    setBusy(inv.id);
    const { data, error: err } = await acceptMyInvitation(inv.id);
    setBusy(null);
    if (err !== null) return setError(err);
    setItems((list) => list.filter((x) => x.id !== inv.id));
    await refresh();
    setActiveId(data.device_id);
    pushToast({
      kind: "success",
      title: "تم قبول الدعوة",
      body: `أصبح لديك وصول إلى «${inv.device_name}».`,
    });
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[13px] font-medium text-danger-strong">
          {error}
        </p>
      )}
      {items.map((inv) => (
        <Card key={inv.id} className="border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-600">
              <MailPlus className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-brand-900">
                دعوة للانضمام إلى «{inv.device_name}»
              </p>
              <p className="mt-0.5 text-[12px] leading-5 text-brand-900/80">
                {inv.inviter_name ? `من ${inv.inviter_name}، ` : ""}بصلاحية «
                {ROLE_META[inv.role]?.label ?? inv.role}».
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              loading={busy === inv.id}
              disabled={busy !== null}
              onClick={() => void accept(inv)}
            >
              قبول الدعوة
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => setItems((list) => list.filter((x) => x.id !== inv.id))}
            >
              لاحقاً
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
