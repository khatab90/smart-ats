// Board ↔ Supabase transport: the three device RPCs over HTTPS, exactly as
// the ESP32 firmware calls them (anon key + per-device token).
export function supabaseTransport({ supabaseUrl, anonKey, deviceId, token, fetchImpl = fetch }) {
  const base = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc`;
  async function rpc(fn, args) {
    const res = await fetchImpl(`${base}/${fn}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${body?.message ?? ""}`.trim());
    return body;
  }
  return {
    ingest: (payload) => rpc("device_ingest", { p_device_id: deviceId, p_token: token, p_payload: payload }),
    getSettings: () => rpc("device_get_settings", { p_device_id: deviceId, p_token: token }),
    ack: (id, status, result) =>
      rpc("device_ack_command", {
        p_device_id: deviceId,
        p_token: token,
        p_command_id: id,
        p_status: status,
        p_result: result,
      }),
  };
}
