import { BrainCircuit, Hand, LoaderCircle, ZapOff } from "lucide-react";
import { PowerFlow } from "../../components/PowerFlow";
import { MODE_LABEL, SOURCE_META } from "../../data/meta";
import { cn } from "../../lib/cn";
import { fmtClock, fmtKw, fmtReading, fmtTime } from "../../lib/format";
import { useActiveDevice, useNow } from "../../store/devices";
import { t } from "../../i18n";

export function Hero() {
  const { status, link, settings, serverNow } = useActiveDevice();
  useNow(1000);
  const live = link === "live" || link === "stale";
  const tz = settings?.timezone;
  const active = status?.active_source ?? null;
  const meta = active ? SOURCE_META[active] : null;
  const state = status?.system_state;
  const lastSeen = status?.last_seen_at ? Date.parse(status.last_seen_at) : null;
  const metrics = live
    ? [
        { l: t("الجهد"), v: fmtReading(status?.load?.v), u: "V" },
        { l: t("التيار"), v: fmtReading(status?.load?.a, 1), u: "A" },
        { l: t("القدرة"), v: fmtKw(status?.load?.w), u: "kW" },
      ]
    : [
        { l: t("الجهد"), v: "—", u: "V" },
        { l: t("التيار"), v: "—", u: "A" },
        { l: t("القدرة"), v: "—", u: "kW" },
      ];

  let headline: React.ReactNode;
  if (link === "never") {
    headline = (
      <div>
        <p className="text-[22px] font-bold text-white/75">{t("لا توجد بيانات حالياً")}</p>
        <p className="text-[12px] text-white/55">
          {t("ستظهر الحالة فور وصول أول قراءة من البورد")}
        </p>
      </div>
    );
  } else if (!live) {
    headline = (
      <div>
        <p className="text-[22px] font-bold text-white/75">{t("غير متصل")}</p>
        <p className="text-[12px] text-white/55">
          {t("آخر حالة معروفة في")} {lastSeen ? fmtTime(lastSeen, tz) : "—"}:{" "}
          {state === "no_source" ? t("لا يوجد مصدر") : meta ? meta.name : t("غير معروف")}
        </p>
      </div>
    );
  } else if (state === "transferring") {
    headline = (
      <div>
        <p className="flex items-center gap-2 text-[22px] font-bold">
          <LoaderCircle className="size-5 animate-spin text-warn" />
          {t("جارٍ التحويل…")}
        </p>
        <p className="text-[12px] text-white/60">
          {t("فصل المصدر الحالي ثم توصيل المصدر الجديد بعد مهلة الأمان")}
        </p>
      </div>
    );
  } else if (state === "no_source" || !meta) {
    headline = (
      <div>
        <p className="flex items-center gap-2 text-[22px] font-bold text-[#ff8a80]">
          <ZapOff className="size-5" /> {t("لا يوجد مصدر متاح")}
        </p>
        <p className="text-[12px] text-white/60">{t("الأحمال غير مغذّاة بالطاقة")}</p>
      </div>
    );
  } else {
    const since = status?.active_since ? Date.parse(status.active_since) : null;
    headline = (
      <div>
        <p className="flex items-center gap-2 text-[24px] leading-tight font-bold tracking-tight">
          <span
            className="size-2.5 rounded-full"
            style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }}
          />
          {meta.name}
        </p>
        <p className="mt-0.5 text-[12px] text-white/60">
          {t("يعمل منذ")}{" "}
          <span className="num font-semibold text-white" dir="ltr">
            {since ? fmtClock(serverNow() - since) : "—"}
          </span>
        </p>
      </div>
    );
  }

  return (
    <section className="hero-surface relative overflow-hidden rounded-[28px] p-5 text-white shadow-[0_24px_48px_-24px_rgba(10,31,61,0.8)]">
      <div className="hero-grid absolute inset-0" />
      <div className="relative flex items-center justify-between">
        <p className="text-[12px] font-medium text-white/60">{t("المصدر الكهربائي الفعّال")}</p>
        {status?.mode && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
            {status.mode === "smart" ? (
              <BrainCircuit className="size-3.5" />
            ) : (
              <Hand className="size-3.5" />
            )}
            {MODE_LABEL[status.mode]}
          </span>
        )}
      </div>
      <div className="relative mt-3">{headline}</div>
      <div className="relative mt-3">
        <PowerFlow status={status} live={live} />
      </div>
      <div className="relative mt-6 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.07] py-3">
        {metrics.map((m) => (
          <div key={m.l} className="px-3 text-center">
            <p className="text-[11px] text-white/55">{m.l}</p>
            <p
              className={cn("num mt-0.5 text-[18px] font-bold", !live && "text-white/45")}
              dir="ltr"
            >
              {m.v}
              <span className="ms-1 text-[11px] font-medium text-white/55">{m.u}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
