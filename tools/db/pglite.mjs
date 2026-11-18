// PGlite (PostgreSQL in WASM) with minimal Supabase stubs and the real
// migrations applied in order. Used by the DB tests and the type generator.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);

/** Migration files in the order Supabase applies them (timestamp prefix). */
export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, MIGRATIONS_DIR), "utf8") }));
}

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create table auth.users (id uuid primary key, email text, phone text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on all functions in schema auth to anon, authenticated;
`;


/** A fresh database with every migration applied (`upTo` limits the set). */
export async function bootDatabase({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const m of migrationFiles()) {
    if (upTo && m.name > upTo) break;
    await db.exec(m.sql);
  }
  return db;
}
