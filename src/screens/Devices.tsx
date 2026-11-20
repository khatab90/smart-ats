import { Copy, Crown, LogOut, Pencil, Plus, Router, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  ScreenHeader,
  Sheet,
  Skeleton,
} from "../components/ui";
import { ROLE_META } from "../data/meta";
import type { DeviceStatus, Membership } from "../data/types";
import { cn } from "../lib/cn";
import { fmtAgo, fmtFullDate } from "../lib/format";
import { classifyLink } from "../lib/link";
import { fetchLinkSummaries, leaveDevice, releaseDevice, renameDevice } from "../api/devices";
import { useDevices } from "../store/devices";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";
import { t, uiStart } from "../i18n";

type StatusLite = Pick<DeviceStatus, "online" | "last_seen_at" | "interval_ms">;

export function Devices() {
  const { memberships, loading, error, refresh, activeId, setActiveId, clockOffsetMs } =
    useDevices();
  const { back, push } = useNav();
  const { pushToast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, StatusLite>>({});
  const [edit, setEdit] = useState<Membership | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "release" | "leave"; m: Membership } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!memberships.length) return;
    const load = () =>
      fetchLinkSummaries(memberships.map((m) => m.device.id)).then(({ data }) => {
        const map: Record<string, StatusLite> = {};
        for (const r of data ?? []) map[r.device_id] = r;
        setStatuses(map);
      });
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [memberships]);

  const openEdit = (m: Membership) => {
    setEdit(m);
    setName(m.device.name);
    setLocation(m.device.location ?? "");
  };

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    const { error: err } = await renameDevice(edit.device.id, name.trim(), location.trim() || null);
    setSaving(false);
    if (err !== null) return pushToast({ kind: "error", title: t("تعذر الحفظ"), body: err });
    pushToast({ kind: "success", title: t("تم حفظ بيانات الجهاز") });
    setEdit(null);
    await refresh();
  };

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    const action = confirm.kind === "release" ? releaseDevice : leaveDevice;
    const { error: err } = await action(confirm.m.device.id);
    setBusy(false);
    setConfirm(null);
    setEdit(null);
    if (err !== null)
      return pushToast({ kind: "error", title: t("تعذر تنفيذ العملية"), body: err });
    pushToast({
      kind: "success",
      title: confirm.kind === "release" ? t("تمت إزالة الجهاز من حسابك") : t("غادرت الجهاز"),
    });
    await refresh();
  };

  return (
    <div className="pb-10">
      <ScreenHeader
        title={t("أجهزتي")}
        subtitle={t("بوردات Smart ATS التي يمكنك الوصول إليها")}
        onBack={back}
        right={
          <button
            type="button"
            onClick={() => push("addDevice")}
            aria-label={t("إضافة جهاز")}
            className="flex size-11 items-center justify-center rounded-2xl bg-brand-800 text-white"
          >
            <Plus className="size-5" />
          </button>
        }
      />
      <div className="space-y-3 px-5">
        {error && <ErrorState message={error} onRetry={refresh} />}
        {loading ? (
          <Skeleton className="h-48" />
        ) : memberships.length === 0 ? (
          <EmptyState
            icon={Router}
            title={t("لا توجد أجهزة")}
            body={t("أضف بورد Smart ATS لبدء المراقبة.")}
            action={
              <Button icon={Plus} onClick={() => push("addDevice")}>
                {t("إضافة جهاز")}
              </Button>
            }
          />
        ) : (
          memberships.map((m) => {
            const d = m.device;
            const selected = d.id === activeId;
            const st = statuses[d.id];
            const link = classifyLink(st ?? null, Date.now() + clockOffsetMs);
            const seen = st?.last_seen_at ? Date.parse(st.last_seen_at) : null;
            const online = link.state === "live" || link.state === "stale";
            return (
              <Card
                key={d.id}
                className={cn("p-4", selected && "border-brand-500 ring-2 ring-brand-500/10")}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-2xl",
                      online ? "bg-ok-soft text-ok" : "bg-canvas text-faint",
                    )}
                  >
                    <Router className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[15px] font-bold text-ink">{d.name || d.id}</p>
                      {selected && <Badge tone="info">{t("الحالي")}</Badge>}
                    </div>
                    <p className="truncate text-[12px] text-muted">
                      {d.location || t("بدون موقع")}
                    </p>
                  </div>
                  <Badge
                    tone={!st ? "neutral" : online ? "ok" : "danger"}
                    dot
                    pulse={link.state === "live"}
                  >
                    {!st
                      ? "…"
                      : link.state === "never"
                        ? t("لم يتصل بعد")
                        : online
                          ? t("متصل")
                          : t("غير متصل")}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    { k: "Device ID", v: d.id, ltr: true },
                    {
                      k: t("صلاحيتك"),
                      v: m.isOwner
                        ? t("مالك • {0}", { 0: ROLE_META[m.role].label })
                        : ROLE_META[m.role].label,
                    },
                    { k: t("آخر اتصال"), v: seen ? fmtAgo(seen, Date.now() + clockOffsetMs) : "—" },
                    { k: t("البرنامج الثابت"), v: d.firmware ?? "—", ltr: true },
                    {
                      k: t("تاريخ الإضافة"),
                      v: d.claimed_at ? fmtFullDate(Date.parse(d.claimed_at)) : "—",
                    },
                  ].map((x) => (
                    <div key={x.k} className="rounded-xl bg-canvas px-3 py-2">
                      <dt className="text-muted">{x.k}</dt>
                      <dd
                        className="num mt-0.5 truncate font-semibold text-ink"
                        dir={x.ltr ? "ltr" : undefined}
                        style={x.ltr ? { textAlign: uiStart() } : undefined}
                      >
                        {x.v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex gap-2">
                  {!selected && (
                    <Button size="sm" className="flex-1" onClick={() => setActiveId(d.id)}>
                      {t("تفعيل")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    icon={Pencil}
                    onClick={() => openEdit(m)}
                  >
                    {t("إدارة")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={Copy}
                    aria-label={t("نسخ Device ID")}
                    onClick={() => {
                      void navigator.clipboard?.writeText(d.id).then(
                        () =>
                          pushToast({ kind: "success", title: t("تم نسخ Device ID"), body: d.id }),
                        () => pushToast({ kind: "error", title: t("تعذر النسخ") }),
                      );
                    }}
                  />
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={t("إدارة الجهاز")}>
        {edit && (
          <div className="space-y-4">
            {edit.role === "admin" ? (
              <>
                <Field
                  label={t("اسم الجهاز")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Field
                  label={t("الموقع (اختياري)")}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
                <Button full loading={saving} disabled={name.trim().length < 2} onClick={save}>
                  {t("حفظ")}
                </Button>
              </>
            ) : (
              <p className="rounded-2xl bg-canvas p-3 text-[12px] text-muted">
                {t("تعديل بيانات الجهاز متاح للمسؤول فقط.")}
              </p>
            )}
            {edit.isOwner ? (
              <Button
                full
                variant="danger"
                icon={Trash2}
                onClick={() => setConfirm({ kind: "release", m: edit })}
              >
                {t("إزالة الجهاز من الحساب")}
              </Button>
            ) : (
              <Button
                full
                variant="danger"
                icon={LogOut}
                onClick={() => setConfirm({ kind: "leave", m: edit })}
              >
                {t("مغادرة الجهاز")}
              </Button>
            )}
            {edit.isOwner && (
              <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted">
                <Crown className="mt-0.5 size-3.5 shrink-0 text-warn" />{" "}
                {t("أنت المالك. لنقل الملكية لمسؤول آخر استخدم شاشة المستخدمين والصلاحيات.")}
              </p>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "release" ? t("إزالة الجهاز") : t("مغادرة الجهاز")}
        confirmLabel={t("تأكيد")}
        danger
        loading={busy}
        onConfirm={() => void doConfirm()}
      >
        <p className="text-[13px] leading-6 text-ink-2">
          {confirm?.kind === "release"
            ? t(
                "سيُفصل الجهاز عن حسابك وعن جميع المستخدمين، وتُحذف سجلاته وقراءاته المخزنة حتى لا يراها أي مالك لاحق. لإعادة إضافته ستحتاج إلى معرّف الجهاز ورمز PIN.",
              )
            : t("ستفقد الوصول إلى هذا الجهاز وإشعاراته.")}
        </p>
      </ConfirmDialog>
    </div>
  );
}
