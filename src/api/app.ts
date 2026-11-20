import type { AppRequirements } from "../domain/version";
import { supabase } from "./client";
import { run } from "./result";

/** App versions the server supports (migration 7); readable before sign-in. */
export const fetchAppRequirements = () =>
  run(supabase.rpc("app_requirements"), (d) => d as unknown as AppRequirements);
