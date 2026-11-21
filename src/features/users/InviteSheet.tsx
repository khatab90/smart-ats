import { Check, Mail } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Field, Sheet } from "../../components/ui";
import { ROLE_META } from "../../data/meta";
import type { Role } from "../../data/types";
import { cn } from "../../lib/cn";
import { createInvitation, sendInvitationEmail } from "../../api/members";
import { useToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { t } from "../../i18n";

export const ROLES: Role[] = ["admin", "viewer"];

export function RoleOption({
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

export function InviteSheet({
  open,
  onClose,
  deviceId,
  deviceName,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  deviceId: string;
  deviceName: string;
  onSent: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      return setError(t("صيغة البريد الإلكتروني غير صحيحة"));
    setError("");
    setLoading(true);
    const { data, error: err } = await createInvitation(deviceId, e, role);
    if (err !== null) {
      setLoading(false);
      return setError(err);
    }
    const mail = await sendInvitationEmail(e, data.token, {
      device: deviceName,
      inviter: profile?.full_name ?? null,
    });
    setLoading(false);
    await onSent();
    if (mail.error !== null) {
      setError(
        t("حُفظت الدعوة لكن تعذر إرسال البريد: {0} يمكنك إعادة الإرسال من قائمة الدعوات.", {
          0: mail.error,
        }),
      );
      return;
    }
    pushToast({
      kind: "success",
      title: t("تم إرسال الدعوة"),
      body: t("{0} • صالحة 72 ساعة", { 0: e }),
    });
    setEmail("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("دعوة مستخدم")}
      footer={
        <Button full onClick={submit} icon={Mail} loading={loading}>
          {t("إرسال الدعوة")}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label={t("البريد الإلكتروني")}
          icon={Mail}
          type="email"
          ltr
          placeholder="name@example.com"
          value={email}
          error={error}
          onChange={(ev) => setEmail(ev.target.value)}
        />
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink-2">{t("الصلاحية")}</p>
          {ROLES.map((r) => (
            <RoleOption key={r} role={r} selected={role === r} onSelect={() => setRole(r)} />
          ))}
        </div>
        <p className="flex items-start gap-2 text-[11px] leading-5 text-muted">
          <Badge tone="info">{t("ملاحظة")}</Badge>
          {t(
            "يصل رابط خاص صالح لمرة واحدة ولمدة 72 ساعة. يفتحه المدعو ويسجّل الدخول أو ينشئ حساباً، ثم يقبل الدعوة.",
          )}
        </p>
      </div>
    </Sheet>
  );
}
