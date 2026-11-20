export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand";

export const TONE: Record<Tone, { text: string; bg: string; dot: string }> = {
  ok: { text: "text-ok-strong", bg: "bg-ok-soft", dot: "bg-ok" },
  warn: { text: "text-warn-strong", bg: "bg-warn-soft", dot: "bg-warn" },
  danger: { text: "text-danger-strong", bg: "bg-danger-soft", dot: "bg-danger" },
  info: { text: "text-brand-700", bg: "bg-brand-100", dot: "bg-brand-500" },
  brand: { text: "text-white", bg: "bg-brand-800", dot: "bg-white" },
  neutral: { text: "text-ink-2", bg: "bg-canvas", dot: "bg-faint" },
};
