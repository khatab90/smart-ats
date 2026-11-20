# Smart ATS — ESP32 ↔ Supabase protocol v1 (revision 2)

The board talks HTTPS to Supabase PostgREST RPC endpoints:

- Base URL: `https://<project>.supabase.co/rest/v1/rpc/<function>`
- Headers on every call: `apikey: <anon key>`, `Authorization: Bearer <anon key>`, `Content-Type: application/json`.
- The board authenticates with its own secret `token` (from `register_device`), sent as a parameter.
- **Never** embed the service-role key in firmware.

The reference implementation of everything below is the board in the
separate **smart-ats-simulator** project (`src/board/board.mjs`, decision
logic in `logic.mjs`). It and the firmware must pass the test vectors in
[`protocol/logic-vectors.json`](../protocol/logic-vectors.json), which this
document and that file define.

> **Revision 2 changes** (migration `20261118000000`): `boot_id`; clock guard
> and `server_time` sync; one bad event no longer rejects a message;
> `lockout_cleared` event; protection-first rule; contactor close
> verification; **all sources are passive** (the board never starts the
> generator); **solar schedule** for Smart mode (`sources.<id>.allowed`,
> `solar_schedule`, `utc_offset_min`); capacity, max-current and generator
> start settings removed.

## 1. `device_ingest` — telemetry + events (every `interval_ms`, e.g. 2 s)

```json
{ "p_device_id": "ATS-000123", "p_token": "<token>", "p_payload": { ... } }
```

Payload fields (`null` = no reading; never send 0 for a missing sensor):

| field | type | meaning |
|---|---|---|
| `v` | 1 | protocol version (required; anything else is rejected) |
| `boot_id` | string ≤ 64 | **random per boot** (e.g. 8 hex chars from `esp_random()`) |
| `seq` | int | telemetry sequence, monotonic per boot |
| `ts` | ISO-8601 UTC | board time (see §1.2) |
| `interval_ms` | int 200–60000 | reporting interval; the app marks data stale after ~3 intervals |
| `fw` | string | firmware version |
| `mode` | `smart` \| `manual` | |
| `mode_since` | ISO | |
| `state` | `normal` \| `transferring` \| `no_source` \| `lockout` | |
| `active` | `grid` \| `solar` \| `generator` \| null | source feeding the load (null in `no_source`) |
| `active_since` | ISO | |
| `sources.<id>` | object | `{ v, f, available, qualified, q_elapsed_s, q_required_s, reason, allowed }` — `allowed: false` when Smart mode may not use the source now (solar outside its schedule) |
| `load` | object | `{ v, a, w, f }` measured on the load side |
| `contactors.<id>` | object | `{ cmd, fb }` commanded vs auxiliary-contact feedback |
| `alarms` | string[] | e.g. `interlock_mismatch`, `settings_incomplete`, `sensor_fault`, `over_temperature`, `inverter_fault`, `generator_alarm` |
| `override` | object \| null | `{ active, at, reason, requested }` when protection overrode a manual choice |
| `config_version` | int | settings version currently applied |
| `controller` | object | `{ uptime_s, reset_reason, temp_c, supply_v, dropped_events }` |
| `rssi` | int −127…0 | dBm |
| `energy_wh.<id>` | number | **cumulative, non-volatile** Wh counter per source |
| `runtime.<id>` | object | `{ s, since }` non-volatile seconds counted only while the source feeds the load |
| `events` | array | buffered events, see §2 |

`sources.<id>.reason` values:

- `no_voltage`, `undervoltage`, `overvoltage`, `underfrequency`, `overfrequency`
- `qualifying`, `locked_out`, `inverter_fault`, `sensor_fault`
- A stopped generator is simply `no_voltage`: the board does not start it.
- `not_installed` — the app hides this source everywhere (dashboard, priority list, live screen, logs)

### 1.1 Robustness guarantees (server side)

- Each event is validated on its own. An event with an unknown `type`, or that is not an object, is **skipped and counted**; an unknown `severity` becomes `info`; an unknown `source`/`from`/`to` becomes `null`; non-object `data` becomes `{}`. The rest of the message is always stored.
- Status fields outside their allowed values (`mode`, `state`, `active`, `interval_ms`, `rssi`, non-object JSON) are stored as `null`.
- Only an authentication failure or an unsupported `v` rejects the whole call.

### 1.2 Board clock

The server trusts `ts` only within **−10 min / +5 min** of its own clock.
Outside that window (no NTP yet, RTC at 1970, …) it uses its own time, keeps
the spacing between buffered events, and answers `"clock_invalid": true`.
The board must then set its clock from `server_time` (offset = `server_time −
local time`) and keep using NTP when available.

Response:

```json
{ "ok": true, "server_time": "...", "clock_invalid": false, "skipped_events": 0,
  "settings_version": 4,
  "commands": [{ "id": "uuid", "type": "set_mode", "payload": { "mode": "manual" }, "expires_at": "..." }] }
```

- If `settings_version > config_version`, call `device_get_settings`, validate, apply, then report the new `config_version` and a `settings_applied` (or `settings_rejected`) event.
- Commands are delivered **at least once**: a delivered command is re-sent after 3 s without an acknowledgement. The board must **de-duplicate by `id`**: on a repeat, send the last acknowledgement again and never execute twice.

## 2. Events

```json
{ "seq": 12, "ts": "...", "type": "transfer_completed", "severity": "info",
  "source": null, "from": "grid", "to": "solar",
  "data": { "reason": "undervoltage", "mode": "smart",
            "detect_ms": 2004, "open_ms": 42, "dead_ms": 1003, "close_ms": 38 } }
```

- De-duplication key: `(device, boot_id, seq)`. `seq` restarts at 1 on every boot; buffered events can be replayed safely after a disconnection. (Persisting `seq` in NVS is no longer required.)
- Types:
  - `source_lost` with `data.was_active` (boolean) and `data.reason`; `source_restored`
  - `transfer_started`, `transfer_completed` with `data.reason`: the failed source's reason when leaving it (`no_voltage | undervoltage | overvoltage | underfrequency | overfrequency | inverter_fault | sensor_fault | locked_out`, or `source_lost`), `source_restored` when a source comes back after a total outage (`no_source_ended`; then `from: null` and `detect_ms: null`, and `dead_ms` is the length of the outage), `priority_return`, `schedule` or `manual`; `transfer_failed` with `data.reason` ∈ `target_lost | close_failed`
  - `no_source_started` with `data.<source> = reason` (`outside_schedule` for solar blocked by its schedule); `no_source_ended`
  - `electrical_fault` with `data.kind` ∈ `undervoltage|overvoltage|underfrequency|overfrequency` and `data.value`; `electrical_fault_cleared`
  - `interlock_fault`, `transfer_lockout` (once per rate-limit episode), `protection_override`, `mode_changed`, `controller_restarted` (once per boot, `data: { reason, active }`: `active` is the source feeding the load right after boot or `null`; if the board connects a source later it reports a normal `transfer_completed` with `from: null`, so the app's runtime history never credits the time the board was off to a source)
  - `settings_applied`, `settings_rejected`, `runtime_reset`
  - `lockout_cleared` (on-site reset, `data.by`)
- When the source just disconnected by protection is left for another one, report it as `from` (not `null`).

The server maps events to user notifications (every type can be muted per user; the two critical ones show a warning when muted):

| notification | events |
|---|---|
| source outage (critical) | `source_lost` with `was_active=true`, `no_source_started` |
| transfer | `transfer_completed` |
| electrical fault | `electrical_fault`, `transfer_lockout` |
| board connection lost | generated by the server watchdog (checks every 10 s, board silent > 30 s) |
| transfer failure (critical) | `transfer_failed`, `interlock_fault` |

## 3. `device_get_settings`

`{ "p_device_id", "p_token" }` returns the settings row:

- `version`, `priority` (always all three sources; hidden/not-installed ones are last)
- `nominal_voltage` ∈ {220, 230, 240}, `nominal_frequency` ∈ {50, 60} — **may be null** until the user sets them
- trip/recover thresholds in **% of nominal** with their delays
- `return_delay_s`, `min_dwell_s`, `rate_limit_count`, `rate_limit_window_min`
- `neutral_delay_ms`, `transfer_timeout_ms` (maximum time to confirm a contactor move through its feedback)
- `manual_revert_min`, `timezone`
- `solar_schedule` — `{ "enabled": bool, "periods": [{ "days": [0..6], "start": "HH:MM", "end": "HH:MM" }] }`; `days` are the days a period starts on (0 = Sunday), `end < start` runs past midnight, disabled = solar allowed at any time (vectors: `schedule`)
- `utc_offset_min` — the device time zone's current UTC offset. Local time = UTC + offset (vectors: `localClock`). **Re-read the settings at boot and every 6 hours** so offset changes are picked up.

While `nominal_voltage` or `nominal_frequency` is null, the board protects
with factory defaults (**230 V / 50 Hz**, configurable in firmware) and
reports the `settings_incomplete` alarm; the app asks the owner to complete
the settings.

## 4. `device_ack_command`

`{ "p_device_id", "p_token", "p_command_id", "p_status", "p_result" }` where `p_status` ∈ `accepted | executing | completed | rejected | failed`.

- Acknowledge `accepted` (or `rejected` with `{ "reason": "..." }`) within **10 s**.
- A manual transfer reports `executing`, then `completed` or `failed`.
- The app only reports success after `completed`.

Commands:

- `set_mode { mode }`
- `set_source { source }` — manual mode only. Refuse if the source is not qualified, a transfer is running, or the system is locked out.
- `reset_runtime { sources: [...] }` — reset the non-volatile counters and set `since` to now.

## 5. Required board behaviour

- **Passive sources.** The board never starts or stops any source. The generator is started by hand or by its own controller; it becomes selectable when it delivers valid voltage and frequency for `return_delay_s`, exactly like the grid.
- **Protection first.** Every control cycle (≈100 ms), before anything else: if the active source is outside its limits (after its delay), open its contactor **immediately**.
- **Qualification:** a source trips after its delay outside the trip limits, and requalifies only inside the recover band, continuously for `return_delay_s`. Loss of voltage trips immediately. (Vectors: `qualification`.)
- **Smart mode:** pick the first qualified source in `priority`, skipping solar outside its schedule. Respect `min_dwell_s` and the rate limit, except when leaving a failed source or solar at the end of its schedule. (Vectors: `smartTarget`, `mayTransfer`, `schedule`.)
- **Solar schedule (Smart mode only):** outside its periods solar is never used, **even if no other source is available**. If the load is on solar when a period ends, move to the next qualified source (reason `schedule`); if there is none, open the solar contactor and report `no_source_started` with `solar: "outside_schedule"`. When a period starts, solar is used again by normal priority rules. Manual mode ignores the schedule.
- **No valid source:** enter `no_source`, open all contactors, stop the runtime and energy counters, report `no_source_started` once.
- **Transfer sequence:** open the old contactor → verify its feedback (welded contact ⇒ latched `lockout` + `interlock_fault`) → wait `neutral_delay_ms` since the last opening → re-check the target → close the new contactor → **verify its feedback within `transfer_timeout_ms`**. If it does not confirm: open it again, report `transfer_failed` with `reason: "close_failed"`, keep that source out of Smart selection for 60 s, and try the next one.
- **Lockout:** latched. Cleared **on site only** (panel button or power cycle after repair); report `lockout_cleared`. There is deliberately no remote unlock (see docs/DECISIONS.md, ADR-005).
- **Manual mode:** protection still moves the load off a failed source and reports `override`. The board does not return to the user's choice by itself. Revert to Smart after `manual_revert_min` if it is set.
- **While offline:** keep events in a ring buffer (≥ 500 entries; count drops in `controller.dropped_events`) and send them in the next successful `device_ingest`.
- **Daily energy:** "today" is computed by the server from hourly buckets in the device `timezone`. Energy counters themselves are never reset.
