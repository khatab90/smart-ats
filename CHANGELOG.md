# Changelog

## 2.10.0 — 2026-11-20

### Changed
- **Home is shorter**: today's energy and transfer totals are gone (they are in Energy and Log), and the priority order can no longer be changed from Home, only from Device settings. In smart mode the mode card no longer shows the order.
- **Power sources never disappear**: a source that is off stays on the list as **Off** with "No voltage", instead of vanishing.
- **Priority screen redesigned**: the order is shown as a numbered chain ("if not available" between steps). **Change order** asks you to tap the first source, then the second; the last one places itself. Start over and Cancel are always there. Replaces drag-and-drop and arrow buttons.
- **Every screen agrees on the board's state.** With no board on the account, Home, Monitor, Energy, Log, Device settings and Users all show the same "No device linked to your account" card with **Add device**, under each tab's own title. With a board that has never reported, Home shows what to check (power, Wi-Fi, device ID) and the other tabs show one "Waiting for the board's first data" card instead of empty charts.

## 2.9.0 — 2026-11-20

Found while testing on the phone: with the phone simulator and the PC emulator both running as ATS-TEST01, the app kept flipping between "no source" and "solar".

### Added
- **Two boards with the same ID are detected** (database migration 4). The server recognises boards alternating from their `boot_id` (never a normal reboot, a boot loop or one delayed message), accepts only the board that started first and refuses the other: it gets no commands and keeps its events until it is accepted. Energy is no longer counted twice.
- The owner gets a critical notification ("Two devices are sending with the same ID", in the board-connection type) and Home shows a red warning explaining what to do. It clears by itself two minutes after the extra device stops.
- ESP32 protocol revision 3: `device_ingest` may answer `ok: false` (§1.3); the board must keep its events. The reference board and the simulator do (smart-ats-simulator 1.2.0). ADR-018.

## 2.8.0 — 2026-11-20

The Android app: install `smart-ats.apk` from the GitHub release and use Smart ATS on the phone.

### Added
- **Android app** from the same code (Capacitor; app ID `iq.smartats.app`, Smart ATS icon). Built by GitHub Actions on every push to `main` and published as the release of the `package.json` version.
- **Back button**: closes the open dialog or sheet, then the inner screen, then returns to Home; from Home the app goes to the background. Settings with unsaved changes, and the create-account / forgot-password screens, handle it too.
- **Google sign-in in the app** opens in the phone's browser (Google refuses sign-in inside apps) and comes back to the app by itself; **email links** (confirmation, password reset, invitations) open the app directly. Needs `smartats://app**` in Supabase Redirect URLs (docs/ANDROID_BUILD.md).
- Edge-to-edge layout that keeps clear of the status and navigation bars; data refreshes when the app returns from the background.

### Changed
- The pending invitation is kept in local storage inside the app (the system may close the app while you confirm your email) and is observable, so an invitation link that arrives while the app is open shows at once.
- Only `src/platform/native.ts` may use Capacitor (ESLint). ADR-017.

## 2.7.0 — 2026-11-20

No simulation in this project any more; nothing changes for users of the app.

### Removed
- The board emulator (`tools/device-emulator`: reference board, PC emulator, their tests) the `emulator` / `emulator:bundle` scripts and the `esbuild` dependency they needed. They moved to the separate **smart-ats-simulator** project, next to the phone simulator.

### Changed
- The end-to-end test replays a recorded board session (`tests/system/board-session.json`: first contact, grid outage, an app command, a reboot) into the real database functions, instead of running a board. Same checks, no simulation code.
- This project owns the board ↔ server contract: `docs/ESP32_PROTOCOL.md` and `protocol/logic-vectors.json` (the app's solar-schedule logic is tested against them). ADR-016 records the split; README, architecture, contributing and setup docs point to the simulator project.

## 2.6.2 — 2026-11-20

### Added
- Board emulator: a source can be "absent" (not installed), or given an exact voltage and frequency; the random drift of the load can be turned off. Used by the new phone simulator (separate project `smart-ats-simulator`); the CLI accepts `grid absent`.

## 2.6.1 — 2026-11-20

Project clean-up; no change to what the app does.

### Fixed
- `supabase/dist/full_install.sql` (the file the setup guide runs on a new Supabase project) was excluded by `.gitignore` and missing from the packages. It is now included and checked by CI.

### Removed
- Dead code: 8 unused functions and constants, the old `ConfirmSheet` name, the phone-frame shadow style, the one-off translation script `tools/i18n/wrap.mjs`, and `supabase/test_device.sql` (same command as in the setup guide).

### Changed
- Database tools moved together into `tools/db/` (`gen-types.mjs`, `bundle-migrations.mjs`).
- README rewritten; contributor rules moved to `CONTRIBUTING.md`; architecture and decisions updated for languages and screen sizes (ADR-013 to ADR-015).
- Added `.editorconfig` and `.nvmrc` (Node 22); CI uses it and runs the text checks; `npm run format` formats code only.

## 2.6.0 — 2026-11-20

Fits every screen: phone, tablet (iPad) and laptop.

### Changed
- **No more phone mockup on large screens**: the app fills the whole window on every device.
- **Navigation adapts**: phones keep the bottom bar; tablets get a side rail (icons with short labels); laptops get a sidebar with the app name, full labels and the signed-in user (opens the profile). It sits on the right in Arabic and on the left in English.
- **Two-column layouts on laptops**: Home (live status, today and sources beside mode and board connection — the phone order is unchanged), Monitor (reading beside the four values), Energy (hourly chart beside the split by source), Log (summary beside the statistics; runtime beside the daily chart) and More.
- Tablets show one comfortable column; settings, profile and other inner screens open in a centered column on large screens.
- **Sign-in** on laptops: brand panel beside the form; on tablets the form is centered.
- Bottom sheets become centered windows on tablets and laptops; notifications appear at the top corner.

## 2.5.0 — 2026-11-19

Design pass: every setting on its own screen, and a confirmation before
anything that changes the board or the app.

### Changed
- **Device settings** is now a list (Operation, Electrical protection, General) showing each section's current value — e.g. "191–253 V" under Voltage limits. Each section (source priority, solar hours, manual mode, nominal values, voltage limits, frequency limits, transfer timers, time zone) opens its own screen with its own Save. Leaving with unsaved changes asks first.
- **Profile** is now a list (Personal details, Security); name, email, phone and password each open their own screen.
- **Home**: the priority order is shown read-only (numbered sources); admins get an "Edit" link that opens Source priority in Device settings.
- **Log → Transfers**: the long list is replaced by a "Transfer log" entry that opens a full screen, filtered by source (all, grid, solar, generator) and by type (smart, manual, failed, total outage).
- **Confirmations** are now centered dialogs with an icon, instead of bottom sheets: switching Smart/Manual, a manual transfer, resetting one source's runtime or all of them, and removing a device.

### Added
- Confirmation before changing the language (said in both languages) and before signing out.
- When the board is offline, the runtime card says clearly that resetting needs the board online (the reset buttons are disabled then).
- `npm run i18n` now also fails on English entries no code uses.

## 2.4.0 — 2026-11-19

### Added
- **Language: Arabic or English**, chosen in More → App settings. The whole app follows it: every text, dates and times, plurals, and the layout direction (right-to-left for Arabic, left-to-right for English, including the power flow, charts, arrows and switches). Changing it reloads the app. Arabic stays the default.
- Every Arabic text in the code now goes through `t()` with its English in `src/i18n/en.ts`. `npm run i18n` (part of `npm run check`) fails if a text is not wrapped or has no translation; a unit test checks placeholders and that no Arabic is left in the English texts.

### Removed
- **Arabic-Indic digits option** (from 2.3.0) and all its code. Numbers are always Western (12355) in both languages.

### Fixed
- The notification badge now reads "9+" in Arabic too (it showed "+9").

### Notes
- Emails sent by Supabase (invitations, confirmation, password reset) are server templates and stay in Arabic. Texts the database writes into notifications are rebuilt by the app in the chosen language.

## 2.3.0 — 2026-11-19

### Added
- **Dark theme**: automatic (follows the phone), light or dark, chosen in More → App settings. Built on semantic colour tokens (`surface`, `track`, …) so every screen adapts; applied before the first paint, so there is no flash.
- **Arabic-Indic digits** (١٢٣) as an option next to Western digits (removed in 2.4.0).
- **Animated power flow** on the home screen: dots travel from the feeding source through the ATS to the house, faster when the house draws more power; still when offline, switching or without a source, and off when the phone asks for reduced motion.

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
