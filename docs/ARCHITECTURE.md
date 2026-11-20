# Architecture

Smart ATS monitors and controls a 3-source automatic transfer switch (national
grid, solar inverter, generator). Three parts, one source of truth each:

```
 ┌──────────────┐  device_ingest / get_settings / ack   ┌──────────────────────────┐
 │  ESP32 board │ ─────────────────────────────────────▶ │  Supabase (Postgres)     │
 │  (firmware)  │ ◀───── commands + settings_version ─── │  RLS · RPC · triggers    │
 └──────────────┘                                        │  pg_cron watchdog/prune  │
        ▲                                                └────────────┬─────────────┘
        │ reference behaviour + test vectors                          │ RLS reads, Realtime,
 ┌──────┴───────────────┐                                             │ checked RPCs
 │ smart-ats-simulator  │                                  ┌──────────▼──────────┐
 │ (separate project)   │                                  │  React app (this    │
 └──────────────────────┘                                  │  repo, src/)        │
                                                           └─────────────────────┘
```

- **The board is the only source of electrical truth.** It decides transfers
  locally (it must keep working offline). The app never invents a reading.
- **The database is the contract.** Every client write goes through RLS or a
  `security definer` function that checks the caller's role. Device calls are
  authenticated by a per-device token, never the service role.
- **The app is a view + remote control.** It reads through RLS, listens with
  Realtime (polling fallback), and sends commands whose lifecycle it tracks
  until the board confirms.

The board's stand-ins — the reference board logic, a PC emulator and a phone
simulator — live in the separate **smart-ats-simulator** project; this
project owns the protocol they follow.

## Repository layout

| Path | Responsibility |
|---|---|
| `supabase/migrations/` | Numbered, run-once migrations (the schema contract) |
| `supabase/dist/full_install.sql` | Generated: all migrations for a new project |
| `protocol/logic-vectors.json` | Test vectors for the ATS decision logic: the reference board, the firmware and the app's schedule logic must pass them |
| `docs/ESP32_PROTOCOL.md` | Board ↔ server protocol |
| `tools/db/` | `pglite.mjs` (Postgres-in-WASM with the real migrations, for tests), `gen-types.mjs` (generates `src/data/database.types.ts`), `bundle-migrations.mjs` (writes `full_install.sql`) |
| `tools/i18n/` | Text checks: every Arabic text goes through `t()` and has an English line |
| `src/config/` | Environment (Supabase URL / anon key / app environment) |
| `src/api/` | **The only code that talks to Supabase.** Typed functions returning `Result<T>` with user-facing errors |
| `src/i18n/` | `t()`, current language and direction; `en.ts` maps each Arabic text to English |
| `src/data/` | Generated DB types, derived domain types, display metadata |
| `src/domain/` | Pure business rules: sources (installed, feeding, priority), settings schema, notification text |
| `src/lib/` | Pure helpers: time zones, formatting, series, timeline, link state, storage, errors |
| `src/store/` | React contexts: auth, devices (meta + live split), notifications, navigation, toasts |
| `src/hooks/` | Data hooks (telemetry window, events, energy, members) and the command lifecycle |
| `src/components/` | Design-system primitives (`ui/`), shared controls, charts, shell |
| `src/features/<area>/` | Screen sections (dashboard, logs, auth, profile, settings, users) |
| `src/screens/` | Top-level screens that compose features |
| `tests/` | `unit/`, `components/` (jsdom), `db/` (PGlite), `system/` (board ↔ DB) |

## Dependency rules

```
screens → features → components/ui
   │          │
   └────┬─────┘
        ▼
  store / hooks ──▶ api ──▶ Supabase
        │            │
        ▼            ▼
      domain ◀──── data (generated types)
        │
        ▼
       lib
```

- Only `src/api/**` imports `@supabase/supabase-js` (enforced by ESLint).
- `domain/` and `lib/` are pure: no React, no I/O — unit-tested directly.
- Row types are derived from `database.types.ts`; a schema change that breaks
  the app breaks `tsc`, not production.

## Data flow examples

**Telemetry.** Board → `device_ingest` (validates per field, stores status +
telemetry + events) → Realtime `postgres_changes` → `ActiveDeviceProvider`
(`status`) and `useTelemetryWindow` (chart).

**Command.** App `send_command` (admin, board online, idempotent id) →
`device_commands` (pending) → returned in the next `device_ingest` response →
board acks `accepted → executing → completed|failed|rejected` → Realtime
updates the command row → `useCommand` shows the phase. Success is shown only
after `completed`; silence becomes a timeout, never a success.

**Notification.** Board event → `events` insert → trigger `_events_notify`
maps it to one of five types, applies each member's preferences and a dedupe
window, stores `params` → Realtime → toast; the app renders the text from
`params` (`domain/notifications.ts`).

## Languages and screens

- **Arabic and English.** Arabic is the source text: every UI string is
  `t("…")`, and `src/i18n/en.ts` holds its English. The language is read from
  local storage before the first render (which also sets `<html lang dir>`);
  changing it reloads the app. Numbers are always Western digits.
- **One layout for every screen size.** Phones: bottom bar, one column.
  Tablets (`md`, ≥ 768 px): side rail, one centered column. Laptops (`lg`,
  ≥ 1024 px): sidebar and two-column screens. Inner screens (settings,
  profile…) open over the content area in a centered column; sheets become
  centered windows on wide screens.

## Quality gates

`npm run check` = `tsc` + ESLint + text checks + all tests + production build.
CI also fails when the generated DB types or the bundled install SQL are out
of date.

| Suite | What it proves |
|---|---|
| `tests/unit` | Domain rules, time zones, timeline, navigation, storage, translations, settings summaries |
| `tests/components` | Controls render and behave (priority list, link badge, command progress) |
| `tests/db` | RLS, every RPC, ingestion robustness, retention, privileges, settings schema ↔ CHECK constraints |
| `tests/system` | A recorded board session replayed into the real database functions, end to end |
