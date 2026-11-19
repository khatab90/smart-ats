import { Bell, ChevronDown, Plus, Router } from "lucide-react";
import { useState } from "react";
import { Button, Card, EmptyState, ErrorState, IconButton, Skeleton } from "../components/ui";
import { useAuth } from "../store/auth";
import { useActiveDevice, useDevices } from "../store/devices";
import { useNav } from "../store/nav";
import { useNotifications } from "../store/notifications";
import { LinkBadge } from "../components/status";
import { ConnectionCard } from "../features/dashboard/ConnectionCard";
import { DeviceSheet } from "../features/dashboard/DeviceSheet";
import { Hero } from "../features/dashboard/Hero";
import { ModeCard } from "../features/dashboard/ModeCard";
import { SourcesCard } from "../features/dashboard/SourcesCard";
import { initialOf } from "../lib/format";
import { PendingInvitations } from "../features/dashboard/PendingInvitations";
import { StatusBanners } from "../features/dashboard/StatusBanners";
import { TodayStats } from "../features/dashboard/TodayStats";
import { t, uiStart } from "../i18n";

export function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? t("صباح الخير") : t("مساء الخير");
}

export function Dashboard() {
  const { profile, user } = useAuth();
  const { memberships, loading, error, refresh } = useDevices();
  const { unreadCount } = useNotifications();
  const { push } = useNav();
  const [deviceSheet, setDeviceSheet] = useState(false);
  const ad = useActiveDevice();
  const firstName = profile?.full_name.split(" ")[0] ?? "";

  return (
    <div className="space-y-5 px-5 pt-4 pb-32 md:px-8 md:pt-8 md:pb-10">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-800 text-[15px] font-bold text-white">
          {initialOf(profile?.full_name, user?.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted">{greeting()}</p>
          <p className="truncate text-[17px] font-bold text-ink">{firstName || t("مرحباً")}</p>
        </div>
        <IconButton
          icon={Bell}
          label={t("الإشعارات")}
          badge={unreadCount}
          onClick={() => push("notifications")}
        />
      </div>

      <PendingInvitations />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-72" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !memberships.length ? (
        <Card className="pt-4">
          <EmptyState
            icon={Router}
            title={t("لا يوجد جهاز مرتبط بحسابك")}
            body={t(
              "أضف بورد Smart ATS باستخدام معرّف الجهاز ورمز PIN، أو اطلب من مسؤول جهاز موجود دعوتك.",
            )}
            action={
              <Button icon={Plus} onClick={() => push("addDevice")}>
                {t("إضافة جهاز")}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setDeviceSheet(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-start transition hover:border-brand-200 lg:max-w-md"
          >
            <Router className="size-[18px] text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">
                {ad.device?.name || ad.device?.id}
              </span>
              <span
                className="num block text-[11px] text-muted"
                dir="ltr"
                style={{ textAlign: uiStart() }}
              >
                {ad.device?.id}
              </span>
            </span>
            <LinkBadge link={ad.link} />
            <ChevronDown className="size-4 text-faint" />
          </button>
          {ad.error && <ErrorState message={ad.error} onRetry={ad.refresh} />}
          <DeviceBody />
        </>
      )}
      <DeviceSheet open={deviceSheet} onClose={() => setDeviceSheet(false)} />
    </div>
  );
}

export function DeviceBody() {
  const ad = useActiveDevice();
  if (ad.loading && !ad.status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  // Phones: one column in reading order. Laptops: two columns — what is
  // happening (hero, today, sources) and what you control (mode, board).
  return (
    <>
      <StatusBanners />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1 lg:order-none">
            <Hero />
          </div>
          <div className="order-3 lg:order-none">
            <TodayStats />
          </div>
          <div className="order-4 lg:order-none">
            <SourcesCard />
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-2 lg:order-none">
            <ModeCard />
          </div>
          <div className="order-5 lg:order-none">
            <ConnectionCard />
          </div>
        </div>
      </div>
    </>
  );
}
