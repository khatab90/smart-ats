import { sourceBadge } from "../../components/status";
import { Badge, Card, SectionTitle, SourceIcon } from "../../components/ui";
import { SOURCE_META } from "../../data/meta";
import type { DeviceStatus, SourceId, SourceReport } from "../../data/types";
import { installedSources, outsideSchedule } from "../../domain/sources";
import { fmtReading } from "../../lib/format";
import { useActiveDevice } from "../../store/devices";
import { t, uiStart } from "../../i18n";

const fmtVf = (r: SourceReport | undefined) => `${fmtReading(r?.v)} V • ${fmtReading(r?.f, 1)} Hz`;

/** Every installed source the board reported, off ones included (they say so). */
function visibleSources(status: DeviceStatus | null): SourceId[] {
  return installedSources(status).filter((id) => Boolean(status?.sources?.[id]));
}

export function SourcesCard() {
  const { status, link } = useActiveDevice();
  const live = link === "live" || link === "stale";
  const noSource = status?.system_state === "no_source";
  const visible = visibleSources(status);

  return (
    <div>
      <SectionTitle title={t("حالة مصادر الطاقة")} />
      <Card className="divide-y divide-line">
        {!live ? (
          <p className="p-4 text-center text-[13px] text-muted">
            {link === "never"
              ? t("لا توجد بيانات حالياً.")
              : t("حالة المصادر غير معروفة أثناء انقطاع الاتصال بالبورد.")}
          </p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-muted">{t("لا توجد مصادر متاحة حالياً.")}</p>
        ) : (
          visible.map((id) => {
            const r = status?.sources?.[id];
            const isActive = status?.active_source === id && !noSource;
            const b = sourceBadge(r, isActive);
            return (
              <div key={id} className="p-4">
                <div className="flex items-center gap-3">
                  <SourceIcon source={id} muted={!isActive && !r?.qualified} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{SOURCE_META[id].name}</p>
                    <p
                      className="num text-[12px] text-muted"
                      dir="ltr"
                      style={{ textAlign: uiStart() }}
                    >
                      {r?.available || r?.qualified ? fmtVf(r) : t("لا يوجد جهد")}
                    </p>
                  </div>
                  <Badge tone={b.tone} dot pulse={isActive}>
                    {b.label}
                  </Badge>
                </div>
                {!isActive && outsideSchedule(r) && status?.mode === "smart" && (
                  <p className="mt-2 text-[11px] leading-5 text-muted">
                    {t(
                      "متوفرة لكن خارج وقتها المحدد، فلن يستخدمها الوضع الذكي. يمكنك التحويل إليها يدوياً.",
                    )}
                  </p>
                )}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
