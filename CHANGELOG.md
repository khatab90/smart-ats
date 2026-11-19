# Changelog

## 2.2.0 — 2026-11-19

### Added
- **Sign in with Google** on the sign-in and sign-up screens, next to email and password (Supabase Google provider; the web OAuth client stays valid for the Android app later, which only adds an Android client).
- **Invitations by verified email** (database migration 3): a signed-in user sees the invitations sent to their verified address on the home screen and accepts them there, so an invitation no longer depends on the email being delivered or opened. An unverified address is never trusted.
- Arabic email templates for invitations, sign-up confirmation and password reset (`supabase/email-templates.txt`); setup steps for Gmail SMTP and Google in `docs/SUPABASE_SETUP.md`.

### Changed
- Profile: Google-only accounts see that Google manages their sign-in; the password and email forms appear only for accounts that have a password.
- A failed or cancelled Google sign-in, or an expired email link, now shows a clear message instead of nothing.

## 2.1.2 — 2026-11-19

First end-to-end test on the real Supabase project: database migration 2
applied, the board emulator reporting live, every screen and scenario driven
in a phone-sized browser (outage, priority return, manual mode and transfer,
strict solar schedule, total outage, board offline and back, runtime reset).
Everything worked; these were found and fixed:

### Fixed
- **Settings could be reverted by a second save.** Right after saving, the form briefly showed the old values (e.g. the solar schedule switched off) with "Save (1)" still pending. The form now keeps only the fields you edit on top of the latest server values, so it can never show or re-send stale values, and it never overwrites another admin's change to a field you did not touch.
- **Runtime history counted time the board was off.** A board that is switched off or rebooted no longer credits the gap to the last source (it showed 24 h of solar for a day the board was off); network-only outages still count, because the board replays its events. `controller_restarted` now carries the source feeding the load after boot.
- **Previous source "ran 40 h"**: its duration now starts at the last boot when that is later than the previous transfer.
- **Live chart:** value axis and time labels (now → 3 min ago); voltage keeps the safe band in view instead of a flat line at the top of a 0–250 V scale (an outage still stretches it to 0).
- **Energy chart** tick labels repeated ("0.1, 0.1, 0.0"); the donut showed 0 kWh for 0.7 kWh. The day chart of the runtime log uses 0 / 8 / 16 / 24 h.
- **Transfer reasons** sent by the board (`no_voltage`, …) showed as "—"; the end of a total outage is reported as `source_restored` (`from: null`) and no longer inflates the average detection and switching times.
- Logs: the sub-tab is part of the address (refresh and links keep it); older transfers show their date; short source names; durations under a minute in seconds; values and units no longer split across lines.
- More: the real app version (was 1.1.0), correct Arabic counts ("جهاز واحد"), menu text without the removed capacities; the same avatar letter on Home and More.

## 2.1.1 — 2026-11-19

### Added
- **Public web build** for a permanent link (Netlify, Cloudflare Pages or any static host): `npm run build:web` (no source maps) and a guide in Arabic, [docs/WEB_DEPLOY.md](docs/WEB_DEPLOY.md).
- Security headers for the hosted site (`public/_headers`): scripts from the site only, network access to Supabase only, no framing, `noindex`; long-term caching for hashed assets. A test keeps the CSP in step with the configured Supabase project.
- `robots.txt` and `netlify.toml` (for a later Git-connected deploy).

### Fixed
- After a new version is published, a tab that was already open no longer fails when it opens a screen: it loads the new version once (guarded against reload loops), and the error screen explains it instead of offering a retry that cannot work.

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
