# Smart ATS

Monitoring and remote-control app for a **3-source automatic transfer switch**
— national grid, solar inverter and generator — driven by an ESP32 board.
Arabic and English, phone, tablet and laptop. React + TypeScript + Supabase,
with an **Android app** built from the same code (Capacitor).

## Features

- **Live status** of every installed source with an animated power-flow view, voltage, current, power and frequency.
- **Smart mode** picks the first qualified source by priority; solar can be limited to set hours. **Manual mode** with safe, confirmed transfers. All sources are passive: the board never starts the generator.
- **History**: energy by hour, day and month and its split by source; transfer log filtered by source and type; runtime hours per source.
- **Protection settings** (nominal values, voltage and frequency limits, transfer timers) applied and confirmed by the board.
- **Notifications** for outages, transfers, electrical faults, failed transfers and lost connection; each type can be muted.
- **Users**: owner, admins and viewers per board; invitations by email; sign-in with Google or email and password.
- Arabic or English, light, dark or automatic theme, and a layout for phones, tablets and laptops.

## Quick start

Requirements: Node.js 20.19+ (see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173 — on your Wi-Fi too: see the "Network" URL
```

The app is already connected to its Supabase project. To use another project,
copy `.env.example` to `.env.local`.

**Android app:** every push to `main` on GitHub builds `smart-ats.apk` and
publishes it under **Releases** — see [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md)
(one Supabase setting is needed for Google sign-in and email links).

**No board yet?** Use the separate **smart-ats-simulator** project: a phone
app (and a PC emulator) that plays the board against the same server, with
outages, faults and scenarios at a tap.

**New Supabase project:** follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
— run `supabase/dist/full_install.sql`, register a board, then in the app
sign up and **Add device** with the board ID and PIN.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run build:web` | Public build for hosting (no source maps) — see [docs/WEB_DEPLOY.md](docs/WEB_DEPLOY.md) |
| `npm run check` | Types + lint + texts + all tests + build — run before every commit |
| `npm test` | All tests: unit, components, database (PGlite), board ↔ database |
| `npm run i18n` | Fails on a text not wrapped in `t()`, without English, or English no code uses |
| `npm run android:sync` | Build for the Android app and copy it into `android/` |
| `npm run android:open` | Open the Android project in Android Studio (optional) |
| `npm run gen:types` | Regenerate `src/data/database.types.ts` after a migration |
| `npm run db:bundle` | Regenerate `supabase/dist/full_install.sql` |
| `npm run format` | Format the code |

## Project layout

```
src/
  api/          the only code that talks to Supabase
  domain/       business rules (pure, unit-tested)
  screens/      top-level screens   features/   their sections
  components/   design system (ui/), charts, shell and navigation
  store/ hooks/ state and data hooks      i18n/  texts and English catalog
  platform/     the only code that talks to the Android shell (Capacitor)
android/        Android project (Capacitor)
supabase/       migrations, full_install.sql, email templates
protocol/       test vectors for the board logic (the firmware must pass them)
tools/          database tools, text checks
tests/          unit, components, database, system
docs/           architecture, decisions, ESP32 protocol, setup guides
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — parts, layers, data flows, quality gates
- [Decisions](docs/DECISIONS.md) — why things are the way they are
- [ESP32 protocol](docs/ESP32_PROTOCOL.md) — what the firmware must implement
- [Supabase setup](docs/SUPABASE_SETUP.md) — database, sign-in, email, boards (Arabic)
- [Android app](docs/ANDROID_BUILD.md) — install, Supabase setting, how it behaves (Arabic)
- [Web deploy](docs/WEB_DEPLOY.md) — permanent link on Netlify (Arabic)
- [Contributing](CONTRIBUTING.md) — rules for changing the code
- [Changelog](CHANGELOG.md)

## License

Private project. All rights reserved.
