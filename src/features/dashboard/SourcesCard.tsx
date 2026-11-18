import { Badge, Card, SectionTitle, SourceIcon } from "../../components/ui";
import { SOURCE_META, SOURCE_ORDER } from "../../data/meta";
import type { SourceReport } from "../../data/types";
import { fmtReading } from "../../lib/format";
import { useActiveDevice } from "../../store/devices";
import { sourceBadge } from "../../components/status";

export const fmtVf = (r: SourceReport | undefined) => `${fmtReading(r?.v)} V • ${fmtReading(r?.f, 1)} Hz`;

export function SourcesCard() {
  const { status, link } = useActiveDevice();
  const live = link === "live" || link === "stale";
  const noSource = status?.system_state === "no_source";
  const visible = SOURCE_ORDER.filter((id) => {
    const r = status?.sources?.[id];
    if (!r || r.reason === "not_installed") return false;
    if (noSource) return true; // A1: show every source with its reason
    const isActive = status?.active_source === id;
    return (
      isActive || r.available || r.qualified || r.reason === "qualifying" || r.reason === "standby"
    );
  });

  return (
    <div>
      <SectionTitle title="حالة مصادر الطاقة" />
      <Card className="divide-y divide-line">
        {!live ? (
          <p className="p-4 text-center text-[13px] text-muted">
            {link === "never"
              ? "لا توجد بيانات حالياً."
              : "حالة المصادر غير معروفة أثناء انقطاع الاتصال بالبورد."}
          </p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-muted">لا توجد مصادر متاحة حالياً.</p>
        ) : (
          visible.map((id) => {
            const r = status?.sources?.[id];
            const isActive = status?.active_source === id && !noSource;
            const b = sourceBadge(r, isActive);
            return (
              <div key={id} className="flex items-center gap-3 p-4">
                <SourceIcon source={id} muted={!isActive && !r?.qualified} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{SOURCE_META[id].name}</p>
                  <p
                    className="num text-[12px] text-muted"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {fmtVf(r)}
                  </p>
                </div>
                <Badge tone={b.tone} dot pulse={isActive}>
                  {b.label}
                </Badge>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
