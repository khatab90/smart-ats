import {
  Check,
  Clock3,
  Crown,
  LogOut,
  Mail,
  Minus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  ScreenHeader,
  SectionTitle,
  Sheet,
  Skeleton,
} from "../components/ui";
import { PERMISSIONS, ROLE_META } from "../data/meta";
import type { InvitationRow, MemberRow, Role } from "../data/types";
import { useMembers } from "../hooks/data";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { fmtDateTime } from "../lib/format";
import { sendInvitationEmail, supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { useActiveDevice, useDevices } from "../store/devices";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";

const ROLES: Role[] = ["admin", "viewer"];
type Pending =
  | { kind: "role"; member: MemberRow; role: Role }
  | { kind: "remove"; member: MemberRow }
  | { kind: "owner"; member: MemberRow }
  | { kind: "leave" }
  | { kind: "revoke"; invitation: InvitationRow };

export function Users() {
  const { user } = useAuth();
  const { device, isAdmin, isOwner } = useActiveDevice();
  const { refresh } = useDevices();
  const { back } = useNav();
  const { pushToast } = useToast();
  const { members, invitations, loading, error, reload } = useMembers(device?.id ?? null, isAdmin);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const ownerId = device?.owner_id;

  const run = async (fn: () => PromiseLike<{ error: unknown }>, success: string) => {
    setBusy(true);
    const { error: err } = await fn();
    setBusy(false);
    setPending(null);
    setSelected(null);
    if (err)
      return pushToast({ kind: "error", title: "تعذر تنفيذ العملية", body: errorMessage(err) });
    pushToast({ kind: "success", title: success });
    await Promise.all([reload(), refresh()]);
  };

  const confirmPending = () => {
    if (!pending || !device) return;
    if (pending.kind === "role")
      return run(
        () =>
          supabase.rpc("set_member_role", {
            p_device_id: device.id,
            p_user_id: pending.member.user_id,
            p_role: pending.role,
          }),
        "تم تغيير الصلاحية",
      );
    if (pending.kind === "remove")
      return run(
        () =>
          supabase.rpc("remove_member", {
            p_device_id: device.id,
            p_user_id: pending.member.user_id,
          }),
        "تمت إزالة المستخدم",
      );
    if (pending.kind === "owner")
      return run(
        () =>
          supabase.rpc("transfer_ownership", {
            p_device_id: device.id,
            p_user_id: pending.member.user_id,
          }),
        "تم نقل الملكية",
      );
    if (pending.kind === "leave")
      return run(() => supabase.rpc("leave_device", { p_device_id: device.id }), "غادرت الجهاز");
    return run(
      () => supabase.rpc("revoke_invitation", { p_invitation_id: pending.invitation.id }),
      "تم إلغاء الدعوة",
    );
  };

  const resend = async (inv: InvitationRow) => {
    const { data, error: err } = await supabase.rpc("resend_invitation", {
      p_invitation_id: inv.id,
    });
    if (err)
      return pushToast({ kind: "error", title: "تعذر إعادة الإرسال", body: errorMessage(err) });
    const res = data as { token: string; email: string };
    const mail = await sendInvitationEmail(res.email, res.token);
    if (mail.error)
      return pushToast({
        kind: "error",
        title: "تم تجديد الدعوة لكن تعذر إرسال البريد",
        body: errorMessage(mail.error),
      });
    pushToast({ kind: "success", title: "أُعيد إرسال الدعوة", body: res.email });
    await reload();
  };

  if (!device) {
    return (
      <div className="pb-10">
        <ScreenHeader title="المستخدمون والصلاحيات" onBack={back} />
        <EmptyState icon={UsersIcon} title="لا يوجد جهاز" body="أضف جهازاً أولاً لإدارة المستخدمين." />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <ScreenHeader
        title="المستخدمون والصلاحيات"
        subtitle={`الوصول إلى «${device.name || device.id}»`}
        onBack={back}
      />
      <div className="space-y-4 px-5">
        {isAdmin ? (
          <Button full icon={UserPlus} onClick={() => setInviteOpen(true)}>
            دعوة مستخدم
          </Button>
        ) : (
          <p className="rounded-2xl bg-canvas px-4 py-3 text-[12px] text-muted">
            صلاحيتك «مشاهد»: يمكنك عرض القائمة فقط.
          </p>
        )}

        {error && <ErrorState message={error} onRetry={reload} />}
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <Card className="divide-y divide-line">
            {members.map((m) => {
              const isMe = m.user_id === user?.id;
              const isDeviceOwner = m.user_id === ownerId;
              const name = m.profile?.full_name || m.profile?.email || "مستخدم";
              const canManage = isAdmin && !isDeviceOwner && !isMe;
              return (
                <button
                  key={m.user_id}
                  type="button"
                  disabled={!canManage && !(isOwner && !isMe) && !(isMe && !isDeviceOwner)}
                  onClick={() => setSelected(m)}
                  className="flex w-full items-center gap-3 p-3.5 text-start transition enabled:hover:bg-canvas/60 disabled:cursor-default"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-[15px] font-bold text-white">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-ink">{name}</span>
                      {isMe && <span className="text-[11px] text-muted">(أنت)</span>}
                      {isDeviceOwner && (
                        <Crown className="size-3.5 text-warn" aria-label="المالك" />
                      )}
                    </span>
                    <span
                      className="block truncate text-[11px] text-muted"
                      dir="ltr"
                      style={{ textAlign: "right" }}
                    >
                      {m.profile?.email}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      ROLE_META[m.role].bg,
                      ROLE_META[m.role].text,
                    )}
                  >
                    {isDeviceOwner ? "مالك" : ROLE_META[m.role].label}
                  </span>
                </button>
              );
            })}
          </Card>
        )}

        {isAdmin && invitations.length > 0 && (
          <div>
            <SectionTitle title="دعوات بانتظار القبول" />
            <Card className="divide-y divide-line">
              {invitations.map((inv) => {
                const expired = Date.parse(inv.expires_at) < Date.now();
                return (
                  <div key={inv.id} className="flex items-center gap-3 p-3.5">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-canvas text-muted">
                      <Mail className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[13px] font-semibold text-ink"
                        dir="ltr"
                        style={{ textAlign: "right" }}
                      >
                        {inv.email}
                      </p>
                      <p
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          expired ? "text-danger" : "text-muted",
                        )}
                      >
                        <Clock3 className="size-3" />
                        {ROLE_META[inv.role].label} •{" "}
                        {expired
                          ? "انتهت الصلاحية"
                          : `صالحة حتى ${fmtDateTime(Date.parse(inv.expires_at))}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="إعادة إرسال"
                      onClick={() => void resend(inv)}
                      className="rounded-xl p-2 text-brand-600 hover:bg-brand-50"
                    >
                      <RefreshCw className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="إلغاء الدعوة"
                      onClick={() => setPending({ kind: "revoke", invitation: inv })}
                      className="rounded-xl p-2 text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="p-4 pb-2">
            <SectionTitle title="الصلاحيات" className="mb-0" />
          </div>
          <div className="grid grid-cols-[1fr_repeat(2,56px)] items-center px-4 pb-2 text-center text-[11px] font-semibold text-muted">
            <span className="text-start">الصلاحية</span>
            {ROLES.map((r) => (
              <span key={r}>{ROLE_META[r].label}</span>
            ))}
          </div>
          <div className="divide-y divide-line border-t border-line">
            {PERMISSIONS.map((p) => (
              <div
                key={p.label}
                className="grid grid-cols-[1fr_repeat(2,56px)] items-center px-4 py-2.5 text-center"
              >
                <span className="text-start text-[12px] leading-5 text-ink-2">{p.label}</span>
                {ROLES.map((r) =>
                  p.roles.includes(r) ? (
                    <Check key={r} className="mx-auto size-4 text-ok" strokeWidth={2.6} />
                  ) : (
                    <Minus key={r} className="mx-auto size-4 text-line" />
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="px-4 py-3 text-[11px] text-muted">
            الصلاحيات خاصة بهذا الجهاز، وتُفرض في قاعدة البيانات وليس في الواجهة فقط.
          </p>
        </Card>
      </div>

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        deviceId={device.id}
        onSent={reload}
      />

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="إدارة المستخدم">
        {selected && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted">
              {selected.profile?.full_name || "مستخدم"} •{" "}
              <span dir="ltr">{selected.profile?.email}</span>
            </p>
            {isAdmin && selected.user_id !== ownerId && selected.user_id !== user?.id && (
              <>
                {ROLES.map((r) => (
                  <RoleOption
                    key={r}
                    role={r}
                    selected={selected.role === r}
                    onSelect={() =>
                      r !== selected.role && setPending({ kind: "role", member: selected, role: r })
                    }
                  />
                ))}
                {isOwner && selected.role === "admin" && (
                  <Button
                    full
                    variant="outline"
                    icon={Crown}
                    onClick={() => setPending({ kind: "owner", member: selected })}
                  >
                    نقل الملكية إلى هذا المستخدم
                  </Button>
                )}
                <Button
                  full
                  variant="danger"
                  icon={Trash2}
                  onClick={() => setPending({ kind: "remove", member: selected })}
                >
                  إزالة المستخدم
                </Button>
              </>
            )}
            {selected.user_id === user?.id && selected.user_id !== ownerId && (
              <Button
                full
                variant="danger"
                icon={LogOut}
                onClick={() => setPending({ kind: "leave" })}
              >
                مغادرة هذا الجهاز
              </Button>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        loading={busy}
        danger={
          pending?.kind === "remove" || pending?.kind === "leave" || pending?.kind === "revoke"
        }
        title={
          pending?.kind === "role"
            ? "تأكيد تغيير الصلاحية"
            : pending?.kind === "owner"
              ? "تأكيد نقل الملكية"
              : pending?.kind === "leave"
                ? "مغادرة الجهاز"
                : pending?.kind === "revoke"
                  ? "إلغاء الدعوة"
                  : "إزالة المستخدم"
        }
        confirmLabel="تأكيد"
        onConfirm={() => void confirmPending()}
      >
        <p className="text-[13px] leading-6 text-ink-2">
          {pending?.kind === "role" &&
            `سيصبح «${pending.member.profile?.full_name || pending.member.profile?.email}» ${ROLE_META[pending.role].label}: ${ROLE_META[pending.role].desc}.`}
          {pending?.kind === "remove" &&
            `سيفقد «${pending.member.profile?.full_name || pending.member.profile?.email}» الوصول إلى هذا الجهاز فوراً.`}
          {pending?.kind === "owner" &&
            `سيصبح «${pending.member.profile?.full_name || pending.member.profile?.email}» مالك الجهاز، وتبقى أنت مسؤولاً يمكنه المالك الجديد إزالته.`}
          {pending?.kind === "leave" &&
            "ستفقد الوصول إلى هذا الجهاز وإشعاراته. يحتاج المسؤول إلى دعوتك مجدداً للعودة."}
          {pending?.kind === "revoke" &&
            `لن يعمل رابط الدعوة المرسل إلى ${pending.invitation.email} بعد الآن.`}
        </p>
      </ConfirmSheet>
    </div>
  );
}

function RoleOption({
  role,
  selected,
  onSelect,
}: {
  role: Role;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition",
        selected ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-200",
      )}
    >
      <span className="flex-1">
        <span className="block text-[14px] font-semibold text-ink">{ROLE_META[role].label}</span>
        <span className="block text-[12px] text-muted">{ROLE_META[role].desc}</span>
      </span>
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-2",
          selected ? "border-brand-600 bg-brand-600 text-white" : "border-line",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function InviteSheet({
  open,
  onClose,
  deviceId,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  deviceId: string;
  onSent: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError("صيغة البريد الإلكتروني غير صحيحة");
    setError("");
    setLoading(true);
    const { data, error: err } = await supabase.rpc("create_invitation", {
      p_device_id: deviceId,
      p_email: e,
      p_role: role,
    });
    if (err) {
      setLoading(false);
      return setError(errorMessage(err));
    }
    const mail = await sendInvitationEmail(e, (data as { token: string }).token);
    setLoading(false);
    await onSent();
    if (mail.error) {
      setError(
        `حُفظت الدعوة لكن تعذر إرسال البريد: ${errorMessage(mail.error)} يمكنك إعادة الإرسال من قائمة الدعوات.`,
      );
      return;
    }
    pushToast({ kind: "success", title: "تم إرسال الدعوة", body: `${e} • صالحة 72 ساعة` });
    setEmail("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="دعوة مستخدم"
      footer={
        <Button full onClick={submit} icon={Mail} loading={loading}>
          إرسال الدعوة
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label="البريد الإلكتروني"
          icon={Mail}
          type="email"
          ltr
          placeholder="name@example.com"
          value={email}
          error={error}
          onChange={(ev) => setEmail(ev.target.value)}
        />
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink-2">الصلاحية</p>
          {ROLES.map((r) => (
            <RoleOption key={r} role={r} selected={role === r} onSelect={() => setRole(r)} />
          ))}
        </div>
        <p className="flex items-start gap-2 text-[11px] leading-5 text-muted">
          <Badge tone="info">ملاحظة</Badge>
          يصل رابط خاص صالح لمرة واحدة ولمدة 72 ساعة. يفتحه المدعو ويسجّل الدخول أو ينشئ حساباً، ثم
          يقبل الدعوة.
        </p>
      </div>
    </Sheet>
  );
}
