// Shared PGlite harness: a Supabase-like Postgres in WASM with the real
// migrations applied in order. Each test file gets its own database.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
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

export const U1 = "11111111-1111-1111-1111-111111111111";
export const U2 = "22222222-2222-2222-2222-222222222222";
export const U3 = "33333333-3333-3333-3333-333333333333";
export const iso = (ms) => new Date(ms).toISOString();

/**
 * Creates a database with every migration applied (`upTo` limits the set).
 * Returns query helpers bound to it.
 */
export async function createDb({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const m of migrationFiles()) {
    if (upTo && m.name > upTo) break;
    await db.exec(m.sql);
  }

  const h = {
    db,
    /** Switches the session to a user (uuid), "anon", or the superuser (null). */
    async as(user, email) {
      await db.exec("reset role");
      if (user === "anon") {
        await db.exec("select set_config('request.jwt.claims', '', false); set role anon;");
      } else if (user) {
        await db.query("select set_config('request.jwt.claims', $1, false)", [
          JSON.stringify({ sub: user, email }),
        ]);
        await db.exec("set role authenticated");
      } else {
        await db.exec("select set_config('request.jwt.claims', '', false)");
      }
    },
    one: async (sql, params) => (await db.query(sql, params)).rows[0],
    rows: async (sql, params) => (await db.query(sql, params)).rows,
    async rejects(sql, params, pattern) {
      await assert.rejects(db.query(sql, params), (e) => {
        assert.match(e.message, pattern);
        return true;
      });
    },
    /** Inserts auth users (profiles are created by the trigger). */
    async users(list) {
      await h.as(null);
      for (const [id, email, name] of list) {
        await db.query(
          "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
          [id, email, JSON.stringify(name ? { full_name: name } : {})],
        );
      }
    },
    /** Registers a board as the superuser and claims it for `owner`. */
    async board(id, owner, ownerEmail, pin = "12345678") {
      await h.as(null);
      const d = (await h.one("select public.register_device($1, 'production', $2) d", [id, pin])).d;
      await h.as(owner, ownerEmail);
      await h.one("select public.claim_device($1, $2, 'production', 'Home') r", [id, pin]);
      return d;
    },
    ingest: (device, payload) =>
      h
        .one("select public.device_ingest($1, $2, $3::jsonb) r", [
          device.device_id,
          device.token,
          JSON.stringify(payload),
        ])
        .then((x) => x.r),
  };
  return h;
}
