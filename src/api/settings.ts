import type { EditableSettings } from "../data/types";
import { supabase } from "./client";
import { run } from "./result";

/** Admin-only (RLS). The board picks the change up via settings_version. */
export const updateSettings = (deviceId: string, patch: Partial<EditableSettings>) =>
  run(supabase.from("device_settings").update(patch).eq("device_id", deviceId), () => null);
