import {
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  Phone,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Field, ScreenHeader, Sheet } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { appBaseUrl, supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

function Msg({ text, tone }: { text: string; tone: "error" | "ok" }) {
  return (
    <p
      className={
        tone === "error"
          ? "rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger-strong"
          : "rounded-xl bg-ok-soft px-3 py-2 text-[12px] text-ok-strong"
      }
    >
      {text}
    </p>
  );
}

export function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { back } = useNav();
  const { pushToast } = useToast();

  return (
    <div className="pb-10">
      <ScreenHeader title="الملف الشخصي" onBack={back} />
      <div className="space-y-4 px-5">
        <div className="flex flex-col items-center py-2">
          <span className="flex size-20 items-center justify-center rounded-[28px] bg-brand-800 text-3xl font-bold text-white shadow-[0_12px_28px_-12px_rgba(15,45,87,0.8)]">
            {(profile?.full_name || user?.email || "?").charAt(0).toUpperCase()}
          </span>
          <p className="mt-3 text-[17px] font-bold text-ink">{profile?.full_name || "بدون اسم"}</p>
          <p className="text-[12px] text-muted" dir="ltr">
            {user?.email}
          </p>
        </div>
        <NameCard
          initial={profile?.full_name ?? ""}
          onSaved={async () => {
            await refreshProfile();
            pushToast({ kind: "success", title: "تم حفظ الاسم" });
          }}
        />
        <EmailCard />
        <PhoneCard onVerified={refreshProfile} />
        <PasswordCard />
        <Button variant="danger" full icon={LogOut} onClick={() => void signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}

function NameCard({ initial, onSaved }: { initial: string; onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setName(initial), [initial]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (name.trim().length < 3) return setError("أدخل الاسم الكامل");
    setError("");
    setSaving(true);
    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("id", user.id);
    if (!err) await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSaving(false);
    if (err) setError(errorMessage(err));
    else await onSaved();
  };

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">الاسم</p>
        {error && <Msg text={error} tone="error" />}
        <Field
          label="الاسم الكامل"
          icon={User}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          full
          icon={Save}
          loading={saving}
          disabled={name.trim() === initial.trim()}
        >
          حفظ الاسم
        </Button>
      </form>
    </Card>
  );
}

function EmailCard() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const pending = user?.new_email;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em))
      return setMsg({ text: "صيغة البريد الإلكتروني غير صحيحة", tone: "error" });
    if (em === user?.email) return setMsg({ text: "هذا هو بريدك الحالي", tone: "error" });
    setSaving(true);
    const { error } = await supabase.auth.updateUser(
      { email: em },
      { emailRedirectTo: appBaseUrl() },
    );
    setSaving(false);
    if (error) return setMsg({ text: errorMessage(error), tone: "error" });
    setEmail("");
    setMsg({ text: `أرسلنا رابط تأكيد إلى ${em}. لن يتغير بريدك قبل فتح الرابط.`, tone: "ok" });
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">البريد الإلكتروني</p>
        <p className="text-[12px] text-muted">
          الحالي: <span dir="ltr">{user?.email}</span>
        </p>
        {pending && (
          <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[12px] text-brand-800">
            <MailCheck className="size-4" /> بانتظار تأكيد البريد الجديد{" "}
            <span dir="ltr">{pending}</span>
          </p>
        )}
        {msg && <Msg text={msg.text} tone={msg.tone} />}
        <Field
          label="البريد الجديد"
          icon={Mail}
          type="email"
          ltr
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
        <Button type="submit" variant="secondary" full loading={saving} disabled={!email.trim()}>
          إرسال رابط التحقق
        </Button>
      </form>
    </Card>
  );
}

function PhoneCard({ onVerified }: { onVerified: () => Promise<void> }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [otpFor, setOtpFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const { pushToast } = useToast();
  const current = user?.phone ? `+${user.phone.replace(/^\+/, "")}` : null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const ph = phone.replace(/[\s-]/g, "");
    if (!PHONE_RE.test(ph))
      return setError("أدخل الرقم بالصيغة الدولية: + ثم رمز الدولة ثم الرقم بدون مسافات");
    setError("");
    setSending(true);
    const { error: err } = await supabase.auth.updateUser({ phone: ph });
    setSending(false);
    if (err) return setError(errorMessage(err));
    setOtpFor(ph);
    setCode("");
    setOtpError("");
  };

  const verify = async () => {
    if (!otpFor) return;
    setVerifying(true);
    const { error: err } = await supabase.auth.verifyOtp({
      phone: otpFor,
      token: code.trim(),
      type: "phone_change",
    });
    setVerifying(false);
    if (err) return setOtpError(errorMessage(err));
    setOtpFor(null);
    setPhone("");
    await onVerified();
    pushToast({ kind: "success", title: "تم التحقق من رقم الهاتف وحفظه" });
  };

  return (
    <Card className="p-4">
      <form onSubmit={send} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">رقم الهاتف</p>
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          {current ? (
            <>
              <ShieldCheck className="size-3.5 text-ok" /> رقم موثّق:{" "}
              <span dir="ltr">{current}</span>
            </>
          ) : (
            "لا يوجد رقم موثّق"
          )}
        </p>
        {error && <Msg text={error} tone="error" />}
        <Field
          label="رقم جديد"
          icon={Phone}
          type="tel"
          ltr
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+ رمز الدولة ثم الرقم"
          hint="يُرسل رمز تحقق برسالة SMS، ولا يُعتمد الرقم قبل إدخاله."
        />
        <Button type="submit" variant="secondary" full loading={sending} disabled={!phone.trim()}>
          إرسال رمز التحقق
        </Button>
      </form>
      <Sheet
        open={otpFor !== null}
        onClose={() => setOtpFor(null)}
        title="رمز التحقق"
        footer={
          <Button full loading={verifying} disabled={code.trim().length < 6} onClick={verify}>
            تحقق واحفظ
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] text-muted">
            أدخل الرمز المرسل إلى <span dir="ltr">{otpFor}</span>
          </p>
          {otpError && <Msg text={otpError} tone="error" />}
          <Field
            label="الرمز"
            ltr
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </div>
      </Sheet>
    </Card>
  );
}

function PasswordCard() {
  const { user } = useAuth();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (pw.next.length < 8)
      return setMsg({ text: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل", tone: "error" });
    if (pw.next !== pw.confirm)
      return setMsg({ text: "كلمتا المرور غير متطابقتين", tone: "error" });
    setLoading(true);
    // Re-authenticate so a left-open session cannot silently change the password.
    const re = await supabase.auth.signInWithPassword({ email: user.email, password: pw.current });
    if (re.error) {
      setLoading(false);
      return setMsg({ text: "كلمة المرور الحالية غير صحيحة", tone: "error" });
    }
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setLoading(false);
    if (error) return setMsg({ text: errorMessage(error), tone: "error" });
    setPw({ current: "", next: "", confirm: "" });
    setMsg({ text: "تم تغيير كلمة المرور", tone: "ok" });
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-[15px] font-bold text-ink">تغيير كلمة المرور</p>
        {msg && <Msg text={msg.text} tone={msg.tone} />}
        <Field
          label="كلمة المرور الحالية"
          icon={Lock}
          type="password"
          ltr
          value={pw.current}
          onChange={(e) => setPw({ ...pw, current: e.target.value })}
          autoComplete="current-password"
        />
        <Field
          label="كلمة المرور الجديدة"
          icon={KeyRound}
          type="password"
          ltr
          value={pw.next}
          onChange={(e) => setPw({ ...pw, next: e.target.value })}
          autoComplete="new-password"
        />
        <Field
          label="تأكيد كلمة المرور"
          icon={KeyRound}
          type="password"
          ltr
          value={pw.confirm}
          onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          autoComplete="new-password"
        />
        <Button
          type="submit"
          variant="secondary"
          full
          loading={loading}
          disabled={!pw.current || !pw.next}
        >
          تحديث كلمة المرور
        </Button>
      </form>
    </Card>
  );
}
