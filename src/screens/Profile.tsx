import { LogOut } from "lucide-react";
import { Button, ScreenHeader } from "../components/ui";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { useToast } from "../store/toast";
import { EmailCard } from "../features/profile/EmailCard";
import { NameCard } from "../features/profile/NameCard";
import { PasswordCard } from "../features/profile/PasswordCard";
import { PhoneCard } from "../features/profile/PhoneCard";

export function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { back } = useNav();
  const { pushToast } = useToast();

  return (
    <div className="pb-10">
      <ScreenHeader title="الملف الشخصي" onBack={back} />
      <div className="space-y-4 px-5">
        <div className="flex flex-col items-center py-2">
          <span className="flex size-20 items-center justify-center rounded-[28px] bg-brand-800 text-3xl font-bold text-white shadow-[0_12px_28px_-12px_rgba(15,45,87,0.8)]">
            {(profile?.full_name || user?.email || "?").charAt(0).toUpperCase()}
          </span>
          <p className="mt-3 text-[17px] font-bold text-ink">{profile?.full_name || "بدون اسم"}</p>
          <p className="text-[12px] text-muted" dir="ltr">
            {user?.email}
          </p>
        </div>
        <NameCard
          initial={profile?.full_name ?? ""}
          onSaved={async () => {
            await refreshProfile();
            pushToast({ kind: "success", title: "تم حفظ الاسم" });
          }}
        />
        <EmailCard />
        <PhoneCard onVerified={refreshProfile} />
        <PasswordCard />
        <Button variant="danger" full icon={LogOut} onClick={() => void signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
