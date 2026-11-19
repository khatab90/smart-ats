import { Bell, LogOut, Plus, Router, Settings2, ShieldCheck, UserRound, Users } from "lucide-react";
import { arCount, initialOf } from "../lib/format";
import { Badge, Card, Row } from "../components/ui";
import { ROLE_META } from "../data/meta";
import { useAuth } from "../store/auth";
import { useActiveDevice, useDevices } from "../store/devices";
import { useNav } from "../store/nav";
import { useNotifications } from "../store/notifications";

const DEVICE_COUNT = {
  one: "جهاز واحد",
  two: "جهازان",
  few: "أجهزة",
  many: "جهازاً",
  base: "جهاز",
};

export function More() {
  const { profile, user, signOut } = useAuth();
  const { memberships } = useDevices();
  const { membership, device } = useActiveDevice();
  const { unreadCount } = useNotifications();
  const { push } = useNav();
  return (
    <div className="space-y-5 px-5 pt-4 pb-32">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">المزيد</h1>

      <Card onClick={() => push("profile")} className="flex items-center gap-3 p-4">
        <span className="flex size-14 items-center justify-center rounded-[20px] bg-brand-800 text-xl font-bold text-white">
          {initialOf(profile?.full_name, user?.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink">
            {profile?.full_name || "بدون اسم"}
          </p>
          <p className="truncate text-[12px] text-muted" dir="ltr" style={{ textAlign: "right" }}>
            {user?.email}
          </p>
          {membership && (
            <Badge tone="info" className="mt-1.5">
              {membership.isOwner ? "مالك • " : ""}
              {ROLE_META[membership.role].label} في {device?.name || device?.id}
            </Badge>
          )}
        </div>
      </Card>

      <Group title="الأجهزة">
        <Row
          icon={Router}
          title="أجهزتي"
          subtitle={
            memberships.length
              ? `المرتبطة بحسابك: ${arCount(memberships.length, DEVICE_COUNT)}`
              : "لا توجد أجهزة مرتبطة بحسابك"
          }
          onClick={() => push("devices")}
        />
        <Row
          icon={Plus}
          title="إضافة جهاز جديد"
          subtitle="بمعرّف الجهاز ورمز PIN"
          onClick={() => push("addDevice")}
        />
        {device && (
          <Row
            icon={Settings2}
            title="إعدادات الجهاز"
            subtitle="الحدود والمؤقتات والأولوية وأوقات الشمسية"
            onClick={() => push("settings")}
          />
        )}
      </Group>

      <Group title="الحساب">
        <Row
          icon={UserRound}
          title="الملف الشخصي"
          subtitle="الاسم والبريد والهاتف وكلمة المرور"
          onClick={() => push("profile")}
        />
        {device && (
          <Row
            icon={Users}
            title="المستخدمون والصلاحيات"
            subtitle="المسؤولون والمشاهدون والدعوات"
            onClick={() => push("users")}
          />
        )}
        <Row
          icon={Bell}
          title="الإشعارات"
          subtitle="الانقطاع والتحويل والخلل الكهربائي والاتصال"
          onClick={() => push("notifications")}
          right={unreadCount ? <Badge tone="danger">{unreadCount}</Badge> : undefined}
        />
      </Group>

      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/20 bg-white py-3.5 text-[14px] font-bold text-danger transition hover:bg-danger-soft"
      >
        <LogOut className="size-[18px]" /> تسجيل الخروج
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-faint">
        <ShieldCheck className="size-3.5" /> Smart ATS • الإصدار {__APP_VERSION__}
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-[12px] font-semibold text-muted">{title}</p>
      <Card className="divide-y divide-line overflow-hidden">{children}</Card>
    </div>
  );
}
