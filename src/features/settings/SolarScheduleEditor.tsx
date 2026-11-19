import { Clock3, Plus, Trash2 } from "lucide-react";
import { Button, Card, Toggle } from "../../components/ui";
import {
  DAY_SHORT,
  DEFAULT_PERIOD,
  MAX_PERIODS,
  WEEK_ORDER,
  localClock,
  solarAllowedAt,
  toMinutes,
  type SchedulePeriod,
  type SolarSchedule,
} from "../../domain/schedule";
import { cn } from "../../lib/cn";

/**
 * Hours when Smart mode may use solar. Any combination is possible: one
 * period every day, several periods, or different periods per weekday
 * (each period has its own days). Manual mode ignores the schedule.
 */
export function SolarScheduleEditor({
  value,
  onChange,
  timezone,
  disabled,
}: {
  value: SolarSchedule;
  onChange: (next: SolarSchedule) => void;
  timezone: string;
  disabled?: boolean;
}) {
  const setPeriod = (i: number, patch: Partial<SchedulePeriod>) =>
    onChange({
      ...value,
      periods: value.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    });
  const toggleDay = (i: number, day: number) => {
    const days = value.periods[i].days;
    setPeriod(i, {
      days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort(),
    });
  };
  const enable = (on: boolean) =>
    onChange({
      enabled: on,
      periods: on && value.periods.length === 0 ? [{ ...DEFAULT_PERIOD }] : value.periods,
    });

  const nowText = (() => {
    try {
      const { weekday, minutes } = localClock(Date.now(), timezone);
      return solarAllowedAt(value, weekday, minutes)
        ? "الآن: ضمن الوقت المسموح"
        : "الآن: خارج الوقت المسموح";
    } catch {
      return null; // invalid time zone: the form shows its own error
    }
  })();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-solar-soft text-solar">
          <Clock3 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">أوقات استخدام الطاقة الشمسية</p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted">
            في الوضع الذكي فقط. خارج هذه الأوقات لا يستخدم البورد الشمسية حتى لو لم يتوفر مصدر آخر،
            ويمكنك التحويل إليها يدوياً في أي وقت.
          </p>
        </div>
        <Toggle
          checked={value.enabled}
          onChange={enable}
          label="تقييد الشمسية بأوقات"
          disabled={disabled}
        />
      </div>

      {!value.enabled ? (
        <p className="mt-3 rounded-2xl bg-canvas px-3 py-2 text-[12px] text-ink-2">
          غير مقيّدة: يستخدمها الوضع الذكي في أي وقت حسب ترتيب الأولوية.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {value.periods.map((p, i) => {
            const overnight = toMinutes(p.end) < toMinutes(p.start);
            return (
              <div key={i} className="rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-ink-2">الفترة {i + 1}</span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    aria-label={`حذف الفترة ${i + 1}`}
                    disabled={disabled || value.periods.length === 1}
                    onClick={() =>
                      onChange({ ...value, periods: value.periods.filter((_, j) => j !== i) })
                    }
                    className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-muted">
                    من
                    <input
                      type="time"
                      value={p.start}
                      disabled={disabled}
                      onChange={(e) => setPeriod(i, { start: e.target.value })}
                      className="num mt-1 block h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink"
                      dir="ltr"
                    />
                  </label>
                  <label className="text-[11px] text-muted">
                    إلى
                    <input
                      type="time"
                      value={p.end}
                      disabled={disabled}
                      onChange={(e) => setPeriod(i, { end: e.target.value })}
                      className="num mt-1 block h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink"
                      dir="ltr"
                    />
                  </label>
                </div>
                {overnight && (
                  <p className="mt-1 text-[11px] text-muted">تستمر الفترة إلى اليوم التالي.</p>
                )}
                <div
                  className="mt-2 flex flex-wrap gap-1.5"
                  role="group"
                  aria-label={`أيام الفترة ${i + 1}`}
                >
                  {WEEK_ORDER.map((d) => {
                    const on = p.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => toggleDay(i, d)}
                        className={cn(
                          "h-8 rounded-full border px-3 text-[12px] font-semibold transition",
                          on
                            ? "border-solar bg-solar text-white"
                            : "border-line bg-surface text-ink-2",
                        )}
                      >
                        {DAY_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              disabled={disabled || value.periods.length >= MAX_PERIODS}
              onClick={() =>
                onChange({ ...value, periods: [...value.periods, { ...DEFAULT_PERIOD }] })
              }
            >
              إضافة فترة
            </Button>
            {nowText && <span className="text-[11px] text-muted">{nowText}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
