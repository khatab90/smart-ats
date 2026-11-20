import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchAppRequirements } from "../api/app";
import { updateState, type AppRequirements } from "../domain/version";
import { onAppResume } from "../platform/native";

interface AppVersionCtx {
  current: string;
  requirements: AppRequirements | null;
  state: "required" | "available" | "none";
  recheck: () => Promise<void>;
}

const Ctx = createContext<AppVersionCtx | null>(null);

/**
 * Checks once at start (and when the app returns to the foreground) whether
 * this installed version is still supported. Without an answer (offline, an
 * older server) nothing is blocked.
 */
export function AppVersionProvider({ children }: { children: ReactNode }) {
  const [requirements, setRequirements] = useState<AppRequirements | null>(null);
  const recheck = useCallback(async () => {
    const { data } = await fetchAppRequirements();
    if (data) setRequirements(data);
  }, []);
  useEffect(() => {
    void recheck();
    return onAppResume(() => void recheck());
  }, [recheck]);
  const current = __APP_VERSION__;
  return (
    <Ctx.Provider
      value={{ current, requirements, state: updateState(current, requirements), recheck }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppVersion(): AppVersionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppVersion outside AppVersionProvider");
  return v;
}
