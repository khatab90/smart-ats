# Changelog

## 2.1.0 — 2026-11-18

### Changed
- **All sources are passive.** The board never starts the generator; it is used only when it delivers valid power, like the grid. Removed: generator start / warm-up / cool-down settings, the "ready to start" and "failed to start" states, the `reset_generator` command and its button.

### Added
- **Solar schedule for Smart mode.** Any number of periods (up to 8), each with its own days and hours, overnight allowed. Outside them Smart mode never uses solar, even with no other source; manual mode ignores the schedule. Editor in device settings, "outside its hours" badge on the dashboard, the schedule shown under the priority list.
- The board reports `sources.<id>.allowed`; `device_get_settings` returns `utc_offset_min`; shared test vectors for the schedule rule (board and app).


## 2.0.0 — 2026-11-18

Fixes every finding of the audit report and moves the project off Figma Make
onto a standalone, tested code base.

### Reliability (database migration 2)
- One invalid field or event no longer rejects a whole board message; bad events are skipped and counted.
- Events are de-duplicated per `boot_id`, so a board reboot can never silently drop events.
- A board with a wrong clock no longer freezes the dashboard: server time is used and returned for the board to adopt.
- Retention for events (1 year), notifications (90 days) and finished commands (30 days); watchdog every 10 s.
- A delivered command is re-sent only after 3 s without an acknowledgement.

### Security
- Profiles are private; members are listed through `list_device_members`, phone numbers visible to admins only.
- Claiming checks the PIN before revealing that a board is already owned; invalid time zones fall back to UTC.
- Releasing a board wipes its last status and counters for the next owner.
- Unused Figma Edge Function (open CORS) removed; function privileges re-applied as an allow-list.

### ATS control (reference board / protocol revision 2)
- Protection first: a failed source is disconnected immediately, also while the generator is starting.
- Contactor close is verified; a contactor that does not close fails the transfer (`close_failed`) and benches that source.
- `reset_generator` command and app button after a failed generator start.
- Lockout is cleared on site (`lockout_cleared`); `transfer_lockout` reported once per episode.
- Capacity and max-current settings removed (unused).
- Emulator rebuilt as a non-blocking state machine with injected clock and transport; shared logic test vectors for the firmware.

### App
- Sources not installed are hidden everywhere (power flow, priority list, manual buttons, live screen, runtime hours).
- One "feeding the load" rule for tiles, chart and timeline.
- Warning when the generator is first in Smart priority; explanation after a protection override in manual mode.
- All five notification types can be muted (warning on the critical ones); notification text rendered from event facts.
- Board clock / skipped-event / dropped-event diagnostics on the connection card.
- Navigation in the URL: back button closes the top screen, refresh keeps the screen.
- Font self-hosted (works offline / in a mobile WebView); storage failures never crash the app.

### Engineering
- Typed API layer (`src/api`) is the only Supabase access (ESLint-enforced); DB types generated from migrations, domain types derived from them.
- Large files split into `components/ui`, `features/*`; device context split to cut re-renders.
- Settings schema is a single source of truth, proven equal to the DB constraints by a test.
- Vitest for everything: unit, components (jsdom), database (PGlite), board ↔ database system tests.
- ESLint, GitHub Actions CI, README, architecture and decision records.
