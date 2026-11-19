import { Logo } from "../../components/Shell";
import { cn } from "../../lib/cn";
import { t } from "../../i18n";

export function AuthHero({ compact }: { compact: boolean }) {
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
          <p className="text-[12px] text-white/60">{t("نظام التحويل التلقائي الذكي")}</p>
        </div>
      </div>
      {!compact && (
        <>
          <FlowIllustration />
          <h1 className="relative mt-2 text-[26px] leading-tight font-bold tracking-tight">
            {t("طاقة مستمرة،")}
            <br />
            <span className="text-brand-200">{t("تحويل بلا انقطاع.")}</span>
          </h1>
          <p className="relative mt-2 max-w-[290px] text-[13px] leading-6 text-white/65">
            {t("راقب الشبكة والطاقة الشمسية والمولد وتحكم بالتحويل بينها من مكان واحد.")}
          </p>
        </>
      )}
    </div>
  );
}

export function FlowIllustration() {
  const nodes = [
    { x: 40, y: 20, c: "#5b9bff", l: t("الشبكة") },
    { x: 40, y: 62, c: "#f5c542", l: t("الشمسية") },
    { x: 40, y: 104, c: "#a48bff", l: t("المولد") },
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
