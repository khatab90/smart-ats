import { ArrowRight, Check, KeyRound, Lock, Mail, MailCheck, MailPlus, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "../components/Shell";
import { Button, Field } from "../components/ui";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { getPendingInvite } from "../lib/invite";
import { appBaseUrl, supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

type View = "login" | "signup" | "forgot";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function AuthHero({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "hero-surface relative shrink-0 overflow-hidden px-6 text-white transition-all",
        compact ? "pt-6 pb-14" : "pt-8 pb-16",
      )}
    >
      <div className="hero-grid absolute inset-0" />
      <div className="relative flex items-center gap-3">
        <Logo size={44} className="ring-1 ring-white/20" />
        <div>
          <p className="text-lg leading-tight font-bold tracking-tight" dir="ltr">
            Smart ATS
          </p>
          <p className="text-[12px] text-white/60">نظام التحويل التلقائي الذكي</p>
        </div>
      </div>
      {!compact && (
        <>
          <FlowIllustration />
          <h1 className="relative mt-2 text-[26px] leading-tight font-bold tracking-tight">
            طاقة مستمرة،
            <br />
            <span className="text-brand-200">تحويل بلا انقطاع.</span>
          </h1>
          <p className="relative mt-2 max-w-[290px] text-[13px] leading-6 text-white/65">
            راقب الشبكة والطاقة الشمسية والمولد وتحكم بالتحويل بينها من مكان واحد.
          </p>
        </>
      )}
    </div>
  );
}

function FlowIllustration() {
  const nodes = [
    { x: 40, y: 20, c: "#5b9bff", l: "الشبكة" },
    { x: 40, y: 62, c: "#f5c542", l: "الشمسية" },
    { x: 40, y: 104, c: "#a48bff", l: "المولد" },
  ];
  return (
    <svg viewBox="0 0 320 124" className="relative my-4 h-[110px] w-full" aria-hidden="true">
      {nodes.map((n, i) => (
        <g key={i}>
          <path
            d={`M${320 - n.x - 14} ${n.y} C 200 ${n.y}, 190 62, 150 62`}
            fill="none"
            stroke={i === 0 ? n.c : "rgba(255,255,255,.18)"}
            strokeWidth={i === 0 ? 2.4 : 1.6}
            strokeDasharray={i === 0 ? "6 6" : undefined}
            className={i === 0 ? "animate-flow" : undefined}
          />
          <circle
            cx={320 - n.x}
            cy={n.y}
            r={13}
            fill="rgba(255,255,255,.08)"
            stroke={n.c}
            strokeWidth={1.5}
          />
          <circle cx={320 - n.x} cy={n.y} r={4} fill={n.c} />
        </g>
      ))}
      <path
        d="M126 62 H 72"
        stroke="#12b76a"
        strokeWidth={2.4}
        strokeDasharray="6 6"
        className="animate-flow"
      />
      <rect
        x={126}
        y={44}
        width={36}
        height={36}
        rx={11}
        fill="rgba(255,255,255,.12)"
        stroke="rgba(255,255,255,.3)"
      />
      <text x={144} y={66} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
        ATS
      </text>
      <circle
        cx={52}
        cy={62}
        r={18}
        fill="rgba(18,183,106,.18)"
        stroke="#12b76a"
        strokeWidth={1.5}
      />
      <path
        d="M45 64 l7 -7 l7 7 v6 h-14z"
        fill="none"
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[13px] font-medium text-danger-strong">
      {msg}
    </p>
  );
}

function useCooldown() {
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  return [cooldown, setCooldown] as const;
}

function Login({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    const em = email.trim().toLowerCase();
    if (!em || !password) return setError("أدخل البريد الإلكتروني وكلمة المرور");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: em, password });
    setLoading(false);
    if (err) {
      setError(errorMessage(err));
      setUnconfirmed(/not confirmed/i.test(err.message));
    }
  };

  const resend = async () => {
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: appBaseUrl() },
    });
    if (err) setError(errorMessage(err));
    else setResent(true);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="mb-1">
        <h2 className="text-[22px] font-bold text-ink">تسجيل الدخول</h2>
        <p className="mt-1 text-[13px] text-muted">سجّل الدخول لمتابعة أجهزتك.</p>
      </div>
      <FormError msg={error} />
      {unconfirmed && (
        <Button variant="secondary" full onClick={resend} disabled={resent}>
          {resent ? "تم إرسال رابط التأكيد مجدداً" : "إعادة إرسال رابط التأكيد"}
        </Button>
      )}
      <Field
        label="البريد الإلكتروني"
        icon={Mail}
        type="email"
        ltr
        autoComplete="email"
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div>
        <Field
          label="كلمة المرور"
          icon={Lock}
          type="password"
          ltr
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          onClick={() => onNavigate("forgot")}
          className="mt-2 text-[13px] font-semibold text-brand-600 hover:text-brand-700"
        >
          نسيت كلمة المرور؟
        </button>
      </div>
      <Button type="submit" size="lg" full loading={loading}>
        تسجيل الدخول
      </Button>
      <p className="pt-2 text-center text-[13px] text-muted">
        ليس لديك حساب؟{" "}
        <button
          type="button"
          onClick={() => onNavigate("signup")}
          className="font-bold text-brand-700"
        >
          إنشاء حساب جديد
        </button>
      </p>
    </form>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function BackHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="رجوع"
        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-white text-ink-2"
      >
        <ArrowRight className="size-5" />
      </button>
      <div>
        <h2 className="text-[22px] font-bold text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-6 text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function SentScreen({
  title,
  body,
  email,
  onBack,
  onResend,
}: {
  title: string;
  body: string;
  email: string;
  onBack: () => void;
  onResend: () => Promise<string | null>;
}) {
  const [cooldown, setCooldown] = useCooldown();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setCooldown(30), [setCooldown]);
  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <span className="flex size-20 items-center justify-center rounded-[28px] bg-ok-soft text-ok">
        <MailCheck className="size-9" strokeWidth={1.7} />
      </span>
      <h2 className="mt-5 text-[22px] font-bold text-ink">{title}</h2>
      <p className="mt-2 max-w-[300px] text-[13px] leading-6 text-muted">
        {body}
        <span className="mx-1 font-semibold text-ink" dir="ltr">
          {email}
        </span>
      </p>
      {error && (
        <div className="mt-4 w-full">
          <FormError msg={error} />
        </div>
      )}
      <div className="mt-8 w-full space-y-3">
        <Button size="lg" full onClick={onBack}>
          العودة لتسجيل الدخول
        </Button>
        <Button
          variant="ghost"
          full
          disabled={cooldown > 0}
          loading={loading}
          onClick={async () => {
            setLoading(true);
            const err = await onResend();
            setLoading(false);
            if (err) setError(err);
            else setCooldown(30);
          }}
        >
          {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ث` : "إعادة الإرسال"}
        </Button>
      </div>
    </div>
  );
}

function Signup({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const s = strength(form.password);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const email = form.email.trim().toLowerCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.name.trim().length < 3) return setError("أدخل الاسم الكامل");
    if (!EMAIL_RE.test(email)) return setError("صيغة البريد الإلكتروني غير صحيحة");
    if (form.password.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (form.password !== form.confirm) return setError("كلمتا المرور غير متطابقتين");
    if (!agree) return setError("يجب الموافقة على الشروط وسياسة الخصوصية");
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: { data: { full_name: form.name.trim() }, emailRedirectTo: appBaseUrl() },
    });
    setLoading(false);
    if (err) return setError(errorMessage(err));
    // With email confirmation enabled no session is returned until the link is opened.
    if (!data.session) setSent(true);
  };

  if (sent) {
    return (
      <SentScreen
        title="أكّد بريدك الإلكتروني"
        body="أرسلنا رابط تأكيد الحساب إلى"
        email={email}
        onBack={() => onNavigate("login")}
        onResend={async () => {
          const { error: err } = await supabase.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: appBaseUrl() },
          });
          return err ? errorMessage(err) : null;
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <BackHeader
        title="إنشاء حساب"
        subtitle="أنشئ حسابك ثم أضف جهاز Smart ATS الخاص بك."
        onBack={() => onNavigate("login")}
      />
      <FormError msg={error} />
      <Field
        label="الاسم الكامل"
        icon={User}
        value={form.name}
        onChange={set("name")}
        autoComplete="name"
      />
      <Field
        label="البريد الإلكتروني"
        icon={Mail}
        type="email"
        ltr
        placeholder="name@example.com"
        value={form.email}
        onChange={set("email")}
        autoComplete="email"
        hint="يُرسل رابط تأكيد إلى هذا البريد قبل تفعيل الحساب. يمكنك إضافة رقم الهاتف والتحقق منه لاحقاً من الملف الشخصي."
      />
      <div>
        <Field
          label="كلمة المرور"
          icon={Lock}
          type="password"
          ltr
          placeholder="8 أحرف على الأقل"
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
        />
        {form.password && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition",
                    i < s ? (s <= 1 ? "bg-danger" : s <= 2 ? "bg-warn" : "bg-ok") : "bg-line",
                  )}
                />
              ))}
            </div>
            <span className="text-[11px] font-semibold text-muted">
              {s <= 1 ? "ضعيفة" : s <= 2 ? "متوسطة" : "قوية"}
            </span>
          </div>
        )}
      </div>
      <Field
        label="تأكيد كلمة المرور"
        icon={KeyRound}
        type="password"
        ltr
        placeholder="أعد إدخال كلمة المرور"
        value={form.confirm}
        onChange={set("confirm")}
        error={mismatch ? "كلمتا المرور غير متطابقتين" : undefined}
        autoComplete="new-password"
      />
      <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-6 text-ink-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={agree}
          onClick={() => setAgree((a) => !a)}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition",
            agree ? "border-brand-800 bg-brand-800 text-white" : "border-line bg-white",
          )}
        >
          {agree && <Check className="size-3.5" strokeWidth={3} />}
        </button>
        <span onClick={() => setAgree((a) => !a)}>أوافق على شروط الاستخدام وسياسة الخصوصية</span>
      </label>
      <Button type="submit" size="lg" full loading={loading}>
        إنشاء الحساب
      </Button>
      <p className="text-center text-[13px] text-muted">
        لديك حساب بالفعل؟{" "}
        <button
          type="button"
          onClick={() => onNavigate("login")}
          className="font-bold text-brand-700"
        >
          تسجيل الدخول
        </button>
      </p>
    </form>
  );
}

function Forgot({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const em = email.trim().toLowerCase();

  const request = async () => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: appBaseUrl(),
    });
    return err ? errorMessage(err) : null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!EMAIL_RE.test(em)) return setError("صيغة البريد الإلكتروني غير صحيحة");
    setLoading(true);
    const err = await request();
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (sent) {
    return (
      <SentScreen
        title="تحقق من بريدك"
        body="إذا كان هناك حساب مسجّل، فسيصل رابط تعيين كلمة مرور جديدة إلى"
        email={em}
        onBack={() => onNavigate("login")}
        onResend={request}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <BackHeader
        title="استعادة كلمة المرور"
        subtitle="أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة."
        onBack={() => onNavigate("login")}
      />
      <FormError msg={error} />
      <Field
        label="البريد الإلكتروني"
        icon={Mail}
        type="email"
        ltr
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="lg" full loading={loading}>
        إرسال رابط الاستعادة
      </Button>
    </form>
  );
}

/** Shown after opening a password recovery link. */
export function RecoveryScreen() {
  const { clearRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (password !== confirm) return setError("كلمتا المرور غير متطابقتين");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) setError(errorMessage(err));
    else setDone(true);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar bg-canvas">
      <AuthHero compact />
      <div className="relative -mt-8 flex-1 rounded-t-[32px] bg-canvas px-6 pt-7 pb-8">
        {done ? (
          <div className="flex flex-col items-center pt-4 text-center">
            <span className="flex size-20 items-center justify-center rounded-[28px] bg-ok-soft text-ok">
              <Check className="size-9" />
            </span>
            <h2 className="mt-5 text-[22px] font-bold text-ink">تم تعيين كلمة المرور</h2>
            <Button className="mt-8" size="lg" full onClick={clearRecovery}>
              متابعة
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h2 className="text-[22px] font-bold text-ink">تعيين كلمة مرور جديدة</h2>
            <FormError msg={error} />
            <Field
              label="كلمة المرور الجديدة"
              icon={Lock}
              type="password"
              ltr
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Field
              label="تأكيد كلمة المرور"
              icon={KeyRound}
              type="password"
              ltr
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <Button type="submit" size="lg" full loading={loading}>
              حفظ كلمة المرور
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
