import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandRow, CommandStatus, CommandType } from "../data/types";
import * as commandsApi from "../api/commands";
import { useDeviceMeta } from "../store/devices";

/**
 * Sends a command and tracks its lifecycle (A8). Success is reported only when
 * the board acknowledges `completed`; no answer within the timeout is shown as
 * a timeout, never as success.
 */
export type CommandPhase = "idle" | "sending" | CommandStatus | "timeout" | "error";

export interface CommandState {
  id: string | null;
  type: CommandType | null;
  phase: CommandPhase;
  message: string | null;
}

const IDLE: CommandState = { id: null, type: null, phase: "idle", message: null };
const TERMINAL = new Set<CommandPhase>([
  "completed",
  "rejected",
  "failed",
  "expired",
  "timeout",
  "error",
]);
const ACK_TIMEOUT_MS = 12_000;
// Neutral delay (≤ 3 s) + contactor confirmation (≤ 30 s) + margin.
const EXEC_TIMEOUT_MS = 60_000;

export function useCommand() {
  const { device, onCommand } = useDeviceMeta();
  const [state, setState] = useState<CommandState>(IDLE);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const apply = useCallback((row: Pick<CommandRow, "id" | "status" | "result">) => {
    if (row.id !== stateRef.current.id || TERMINAL.has(stateRef.current.phase)) return;
    setState((s) => ({
      ...s,
      phase: row.status,
      message: row.result?.reason ?? row.result?.message ?? null,
    }));
  }, []);

  useEffect(() => onCommand(apply), [onCommand, apply]);

  // Fallback polling + timeouts while a command is in flight: the board must
  // acknowledge within ACK_TIMEOUT_MS; once accepted, a transfer may take up
  // to EXEC_TIMEOUT_MS.
  const inFlight = state.id !== null && !TERMINAL.has(state.phase);
  useEffect(() => {
    if (!inFlight || !state.id) return;
    const cmdId = state.id;
    const started = Date.now();
    const id = setInterval(async () => {
      const elapsed = Date.now() - started;
      const phase = stateRef.current.phase;
      const acked = phase === "accepted" || phase === "executing";
      if ((!acked && elapsed > ACK_TIMEOUT_MS) || elapsed > EXEC_TIMEOUT_MS) {
        setState((s) =>
          s.id === cmdId && !TERMINAL.has(s.phase) ? { ...s, phase: "timeout" } : s,
        );
        return;
      }
      const { data } = await commandsApi.fetchCommand(cmdId);
      if (data) apply(data);
    }, 2000);
    return () => clearInterval(id);
  }, [inFlight, state.id, apply]);

  const send = useCallback(
    async (type: CommandType, payload: Record<string, unknown>) => {
      if (!device) return;
      const id = crypto.randomUUID();
      setState({ id, type, phase: "sending", message: null });
      const { data, error } = await commandsApi.sendCommand(id, device.id, type, payload);
      if (error !== null) {
        setState({ id, type, phase: "error", message: error });
        return;
      }
      apply(data);
    },
    [device, apply],
  );

  const reset = useCallback(() => setState(IDLE), []);
  const busy = state.phase !== "idle" && !TERMINAL.has(state.phase);
  return { state, send, reset, busy };
}

export const PHASE_LABEL: Record<CommandPhase, string> = {
  idle: "",
  sending: "جارٍ إرسال الأمر…",
  pending: "بانتظار استلام البورد…",
  delivered: "وصل الأمر إلى البورد…",
  accepted: "قبل البورد الأمر…",
  executing: "قيد التنفيذ…",
  completed: "نفّذ البورد الأمر بنجاح",
  rejected: "رفض البورد الأمر",
  failed: "فشل تنفيذ الأمر",
  expired: "انتهت صلاحية الأمر قبل استلامه",
  timeout: "لم يصل تأكيد من البورد خلال المهلة",
  error: "تعذر إرسال الأمر",
};
