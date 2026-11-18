import { CloudOff, Database, LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BottomNav, Logo, PhoneFrame, ToastHost } from "./components/Shell";
import { Skeleton } from "./components/ui";
import { getPendingInvite } from "./lib/invite";
import { AuthFlow } from "./features/auth/AuthFlow";
import { RecoveryScreen } from "./features/auth/RecoveryScreen";
import { Dashboard } from "./screens/Dashboard";
import { InvitationScreen } from "./screens/Invitation";
import { AuthProvider, useAuth } from "./store/auth";
import { ActiveDeviceProvider, DevicesProvider } from "./store/devices";
import { NavProvider, useNav, type Route } from "./store/nav";
import { NotificationsProvider } from "./store/notifications";
import { ToastProvider } from "./store/toast";

const named = <T extends Record<string, unknown>>(p: Promise<T>, key: keyof T) =>
  p.then((m) => ({ default: m[key] as React.ComponentType<object> }));
const Live = lazy(() => named(import("./screens/Live"), "Live"));
const Energy = lazy(() => named(import("./screens/Energy"), "Energy"));
const Logs = lazy(() => named(import("./screens/Logs"), "Logs"));
const More = lazy(() => named(import("./screens/More"), "More"));
const Notifications = lazy(() => named(import("./screens/Notifications"), "Notifications"));
const Profile = lazy(() => named(import("./screens/Profile"), "Profile"));
const Users = lazy(() => named(import("./screens/Users"), "Users"));
const Devices = lazy(() => named(import("./screens/Devices"), "Devices"));
const Settings = lazy(() => named(import("./screens/Settings"), "Settings"));
const AddDevice = lazy(() =>
  import("./screens/AddDevice").then((m) => ({
    default: m.AddDevice as React.ComponentType<{ onClose: () => void }>,
  })),
);

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PhoneFrame>
          <Root />
        </PhoneFrame>
      </AuthProvider>
    </ToastProvider>
  );
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Logo size={56} />
      <LoaderCircle className="size-5 animate-spin text-brand-600" />
    </div>
  );
}

function Root() {
  const { loading, session, recovery, dbError } = useAuth();
  if (loading) return <Splash />;
  if (session && recovery) return <RecoveryScreen />;
  if (!session) {
    return (
      <>
        <AuthFlow />
        <ToastHost />
      </>
    );
  }
  if (dbError === "schema") return <SetupRequired />;
  return (
    <DevicesProvider>
      <ActiveDeviceProvider>
        <NotificationsProvider>
          <NavProvider>
            <SignedIn />
            <ToastHost />
          </NavProvider>
        </NotificationsProvider>
      </ActiveDeviceProvider>
    </DevicesProvider>
  );
}

function SignedIn() {
  const [invite, setInvite] = useState(getPendingInvite());
  if (invite) return <InvitationScreen token={invite} onDone={() => setInvite(null)} />;
  return <MainApp />;
}

function useBrowserOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function ScreenFallback() {
  return (
    <div className="space-y-4 px-5 pt-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

function Screen({ children, id }: { children: ReactNode; id: string }) {
  return (
    <ErrorBoundary resetKey={id}>
      <Suspense fallback={<ScreenFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function MainApp() {
  const { tab, stack, back } = useNav();
  const { dbError, refreshProfile } = useAuth();
  const online = useBrowserOnline();
  const route = (r: Route) => {
    switch (r) {
      case "notifications":
        return <Notifications />;
      case "profile":
        return <Profile />;
      case "users":
        return <Users />;
      case "devices":
        return <Devices />;
      case "addDevice":
        return <AddDevice onClose={back} />;
      case "settings":
        return <Settings />;
    }
  };
  return (
    <div className="relative flex h-full flex-col">
      {(!online || dbError === "network") && (
        <div className="z-40 flex items-center gap-2 bg-danger px-4 py-2 text-[12px] font-semibold text-white">
          <CloudOff className="size-4 shrink-0" />
          <span className="flex-1">
            {!online
              ? "لا يوجد اتصال بالإنترنت. البيانات المعروضة قد تكون قديمة."
              : "تعذر الاتصال بقاعدة البيانات."}
          </span>
          {online && (
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="rounded-lg bg-white/20 px-2 py-1"
            >
              إعادة
            </button>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <main key={tab} className="no-scrollbar h-full animate-fade-in overflow-y-auto">
          <Screen id={tab}>
            {tab === "home" && <Dashboard />}
            {tab === "live" && <Live />}
            {tab === "energy" && <Energy />}
            {tab === "logs" && <Logs />}
            {tab === "more" && <More />}
          </Screen>
        </main>
        <BottomNav />
        {stack.map((r, i) => (
          <div
            key={`${r}-${i}`}
            className="no-scrollbar absolute inset-0 z-40 animate-screen-in overflow-y-auto bg-canvas"
          >
            <Screen id={r}>{route(r)}</Screen>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupRequired() {
  const { signOut, refreshProfile } = useAuth();
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-warn-soft text-warn">
        <Database className="size-7" />
      </span>
      <h1 className="mt-4 text-lg font-bold text-ink">قاعدة البيانات غير مهيأة</h1>
      <p className="mt-2 text-[13px] leading-6 text-muted">
        لم يتم العثور على جداول Smart ATS في Supabase. لمشروع جديد شغّل الملف
        <span className="mx-1 font-mono text-[11px]" dir="ltr">
          supabase/dist/full_install.sql
        </span>
        مرة واحدة من SQL Editor.
      </p>
      <div className="mt-6 flex w-full gap-3">
        <button
          type="button"
          onClick={() => void refreshProfile()}
          className="h-12 flex-1 rounded-2xl bg-brand-800 text-sm font-semibold text-white"
        >
          إعادة التحقق
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="h-12 flex-1 rounded-2xl bg-brand-50 text-sm font-semibold text-brand-800"
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
