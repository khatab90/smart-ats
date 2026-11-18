import type { CommandRow, CommandType } from "../data/types";
import type { Json } from "../data/database.types";
import { supabase } from "./client";
import { asRow, run } from "./result";

export const sendCommand = (
  id: string,
  deviceId: string,
  type: CommandType,
  payload: Record<string, unknown>,
) =>
  run(
    supabase.rpc("send_command", {
      p_command_id: id,
      p_device_id: deviceId,
      p_type: type,
      p_payload: payload as Json,
    }),
    (d) => asRow<CommandRow>(d),
  );

export const fetchCommand = (id: string) =>
  run(
    supabase.from("device_commands").select("id, status, result").eq("id", id).maybeSingle(),
    (d) => (d ? asRow<Pick<CommandRow, "id" | "status" | "result">>(d) : null),
  );
