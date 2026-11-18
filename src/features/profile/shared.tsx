

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export function Msg({ text, tone }: { text: string; tone: "error" | "ok" }) {
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
