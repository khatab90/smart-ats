# Smart ATS

Monitoring and remote-control app for a **3-source automatic transfer switch**
— national grid, solar inverter and generator — driven by an ESP32 board.
Arabic, right-to-left, mobile-first. React + TypeScript + Supabase.

- Live state of every installed source, power-flow view, Smart mode with
  drag-and-drop priority, manual mode with safe transfers
- Live readings (V, A, kW, Hz), energy history (day / week / month)
- Transfer log, runtime hours per source with reset
- Five notification types, users with admin / viewer roles, email invitations

## Quick start

Requirements: Node.js 20.19+ and a Supabase project.

```bash
npm install
npm run dev            # http://localhost:5173 (also on your Wi-Fi: see the "Network" URL)
```

1. Set up the database once — see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
2. Register a board (`select public.register_device('ATS-TEST01');`) and keep the token and PIN.
3. No board yet? Run the emulator: `npm run emulator:bundle`, then `node dist-emulator/ats-emulator.mjs`
   with an `emulator.config.json` next to it.
4. In the app: sign up, then **Add device** with the board ID and PIN.

To point the app at another Supabase project, copy `.env.example` to `.env.local`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and build to `dist/` (relative paths: works on any host or in a Capacitor WebView) |
| `npm test` | All tests (unit, components, database on PGlite, board ↔ database) |
| `npm run check` | Type-check + lint + tests + build — the CI gate |
| `npm run gen:types` | Regenerate `src/data/database.types.ts` after changing a migration |
| `npm run db:bundle` | Regenerate `supabase/dist/full_install.sql` |
| `npm run emulator` / `emulator:bundle` | Run / package the board emulator |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — components, layers, data flows, quality gates
- [Decisions](docs/DECISIONS.md) — why things are the way they are
- [ESP32 protocol](docs/ESP32_PROTOCOL.md) — what the firmware must implement
- [Supabase setup](docs/SUPABASE_SETUP.md) — database, auth, devices, emulator (Arabic)
- [Changelog](CHANGELOG.md)

## Changing the database

1. Add a new file `supabase/migrations/<timestamp>_<name>.sql` (never edit an applied one).
2. `npm run gen:types && npm run db:bundle`
3. Fix whatever `npm run check` reports; add a test in `tests/db/`.
4. Run the new file once in the Supabase SQL editor.
