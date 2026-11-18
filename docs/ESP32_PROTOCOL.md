# Smart ATS — ESP32 ↔ Supabase protocol v1 (revision 2)

The board talks HTTPS to Supabase PostgREST RPC endpoints:

- Base URL: `https://<project>.supabase.co/rest/v1/rpc/<function>`
- Headers on every call: `apikey: <anon key>`, `Authorization: Bearer <anon key>`, `Content-Type: application/json`.
- The board authenticates with its own secret `token` (from `register_device`), sent as a parameter.
- **Never** embed the service-role key in firmware.

The reference implementation of everything below is the emulator
(`tools/device-emulator/board.mjs`, decision logic in `logic.mjs`). The
firmware must pass the shared test vectors in
[`protocol/logic-vectors.json`](../protocol/logic-vectors.json).

> **Revision 2 changes** (migration `20261118000000`): `boot_id`; clock guard
> and `server_time` sync; one bad event no longer rejects a message;
> `reset_generator` command; `generator_reset` and `lockout_cleared` events;
> protection-first rule during generator start; contactor close verification;
> capacity / max-current settings removed.

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
| `sources.<id>` | object | `{ v, f, available, qualified, q_elapsed_s, q_required_s, reason }` |
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
- `qualifying`, `standby` (stopped generator, healthy and ready to start), `failed_to_start`, `locked_out`, `inverter_fault`, `sensor_fault`
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
  - `transfer_started`, `transfer_completed`, `transfer_failed` with `data.reason` ∈ `failed_to_start | target_lost | close_failed | …`
  - `no_source_started` with `data.<source> = reason`; `no_source_ended`
  - `electrical_fault` with `data.kind` ∈ `undervoltage|overvoltage|underfrequency|overfrequency` and `data.value`; `electrical_fault_cleared`
  - `interlock_fault`, `transfer_lockout` (once per rate-limit episode), `protection_override`, `mode_changed`, `controller_restarted`
  - `settings_applied`, `settings_rejected`, `runtime_reset`
  - `generator_reset` (after the `reset_generator` command cleared a lock), `lockout_cleared` (on-site reset, `data.by`)
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
- `gen_crank_attempts`, `gen_warmup_s`, `gen_cooldown_s`
- `manual_revert_min`, `timezone`

While `nominal_voltage` or `nominal_frequency` is null, the board protects
with factory defaults (**230 V / 50 Hz**, configurable in firmware) and
reports the `settings_incomplete` alarm; the app asks the owner to complete
the settings.

## 4. `device_ack_command`

`{ "p_device_id", "p_token", "p_command_id", "p_status", "p_result" }` where `p_status` ∈ `accepted | executing | completed | rejected | failed`.

- Acknowledge `accepted` (or `rejected` with `{ "reason": "..." }`) within **10 s**.
- Long actions (generator crank + warm-up) report `executing`, then `completed` or `failed`.
- The app only reports success after `completed`.

Commands:

- `set_mode { mode }`
- `set_source { source }` — manual mode only. Refuse if the source is not qualified, a transfer is running, or the system is locked out.
- `reset_runtime { sources: [...] }` — reset the non-volatile counters and set `since` to now.
- `reset_generator {}` — clear a `failed_to_start` lock so the generator may be used again. Report `generator_reset` if a lock was cleared.

## 5. Required board behaviour

- **Protection first.** Every control cycle (≈100 ms), before anything else: if the active source is outside its limits (after its delay), open its contactor **immediately** — also while the generator is cranking or warming up. Never keep the load on a failed source while preparing the next one.
- **Qualification:** a source trips after its delay outside the trip limits, and requalifies only inside the recover band, continuously for `return_delay_s`. Loss of voltage trips immediately. (Vectors: `qualification`.)
- **Smart mode:** pick the first selectable source in `priority` (a healthy stopped generator is selectable). Respect `min_dwell_s` and the rate limit, except when leaving a failed source. (Vectors: `smartTarget`, `mayTransfer`.)
- **No valid source:** enter `no_source`, open all contactors, stop the runtime and energy counters, report `no_source_started` once.
- **Transfer sequence:** open the old contactor → verify its feedback (welded contact ⇒ latched `lockout` + `interlock_fault`) → wait `neutral_delay_ms` since the last opening → re-check the target → close the new contactor → **verify its feedback within `transfer_timeout_ms`**. If it does not confirm: open it again, report `transfer_failed` with `reason: "close_failed"`, keep that source out of Smart selection for 60 s, and try the next one.
- **Generator:** crank up to `gen_crank_attempts` times, warm up before taking the load, cool down unloaded after leaving it. After the last failed attempt: `failed_to_start` lock until `reset_generator`.
- **Lockout:** latched. Cleared **on site only** (panel button or power cycle after repair); report `lockout_cleared`. There is deliberately no remote unlock (see docs/DECISIONS.md, ADR-005).
- **Manual mode:** protection still moves the load off a failed source and reports `override`. The board does not return to the user's choice by itself. Revert to Smart after `manual_revert_min` if it is set.
- **While offline:** keep events in a ring buffer (≥ 500 entries; count drops in `controller.dropped_events`) and send them in the next successful `device_ingest`.
- **Daily energy:** "today" is computed by the server from hourly buckets in the device `timezone`. Energy counters themselves are never reset.
