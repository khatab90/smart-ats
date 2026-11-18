import { ArrowRight, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[13px] font-medium text-danger-strong">
      {msg}
    </p>
  );
}

export function useCooldown() {
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  return [cooldown, setCooldown] as const;
}

export function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export function BackHeader({
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

export function SentScreen({
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
