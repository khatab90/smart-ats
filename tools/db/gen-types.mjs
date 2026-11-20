#!/usr/bin/env node
// Generates src/data/database.types.ts from the migrations, in the format
// supabase-js expects (`createClient<Database>`), without a network
// connection: the migrations run on PGlite and the catalog is introspected.
//
// Columns with an `IN (...)` check constraint become string-literal unions,
// so a typo like "smrt" is a compile error in the app.
import { writeFileSync } from "node:fs";
import { bootDatabase } from "./pglite.mjs";

const OUT = new URL("../../src/data/database.types.ts", import.meta.url);
const db = await bootDatabase();
const q = async (sql) => (await db.query(sql)).rows;

const SCALAR = {
  text: "string",
  varchar: "string",
  bpchar: "string",
  uuid: "string",
  citext: "string",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  bool: "boolean",
  timestamptz: "string",
  timestamp: "string",
  date: "string",
  interval: "string",
  json: "Json",
  jsonb: "Json",
  void: "undefined",
  record: "Json",
};
const tsType = (udt) =>
  udt.startsWith("_") ? `${tsType(udt.slice(1))}[]` : (SCALAR[udt] ?? "unknown");
const lit = (vals) => vals.map((v) => JSON.stringify(v)).join(" | ");

// ----------------------------------------------------------------- tables
const tables = (
  await q(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' order by 1`)
).map((r) => r.name);

const columns = await q(`
  select table_name, column_name, udt_name, is_nullable = 'YES' as nullable,
         column_default is not null or is_identity = 'YES' as has_default, ordinal_position
  from information_schema.columns where table_schema = 'public' order by table_name, column_name`);

// Single-column IN (...) checks → literal unions. Handles both
//   (col = ANY (ARRAY['a'::text, 'b'::text]))  and  ((col IS NULL) OR (col = ANY (...)))
const checks = await q(`
  select c.relname as table_name, pg_get_constraintdef(k.oid) as def
  from pg_constraint k join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and k.contype = 'c'`);
const enumOf = {};
for (const { table_name, def } of checks) {
  const m = def.match(/^CHECK \(+(?:\(?(\w+) IS NULL\)? OR )?\(?(\w+) = ANY \(+ARRAY\[([^\]]+)\]/);
  if (!m) continue;
  const col = m[2];
  if (m[1] && m[1] !== col) continue;
  const vals = [...m[3].matchAll(/'([^']*)'::text/g)].map((x) => x[1]);
  if (vals.length) enumOf[`${table_name}.${col}`] = vals;
}
// text[] columns constrained to a fixed set (priority).
const arrayEnums = { "device_settings.priority": ["grid", "solar", "generator"] };

const fks = await q(`
  select k.conname, c.relname as table_name, r.relname as ref_table,
         (select array_agg(a.attname order by a.attnum) from pg_attribute a
            where a.attrelid = k.conrelid and a.attnum = any(k.conkey)) as cols,
         (select array_agg(a.attname order by a.attnum) from pg_attribute a
            where a.attrelid = k.confrelid and a.attnum = any(k.confkey)) as ref_cols,
         exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indisunique
                 and i.indkey::int2[] @> k.conkey and array_length(i.indkey::int2[], 1) = array_length(k.conkey, 1)) as one_to_one
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_class r on r.oid = k.confrelid join pg_namespace rn on rn.oid = r.relnamespace
  where n.nspname = 'public' and rn.nspname = 'public' and k.contype = 'f'
  order by c.relname, k.conname`);

function colType(table, c) {
  const key = `${table}.${c.column_name}`;
  let t = enumOf[key]
    ? lit(enumOf[key])
    : arrayEnums[key]
      ? `(${lit(arrayEnums[key])})[]`
      : tsType(c.udt_name);
  if (c.nullable) t += " | null";
  return t;
}

const tableBlocks = tables.map((t) => {
  const cols = columns.filter((c) => c.table_name === t);
  const row = cols.map((c) => `          ${c.column_name}: ${colType(t, c)};`).join("\n");
  const ins = cols
    .map(
      (c) =>
        `          ${c.column_name}${c.nullable || c.has_default ? "?" : ""}: ${colType(t, c)};`,
    )
    .join("\n");
  const upd = cols.map((c) => `          ${c.column_name}?: ${colType(t, c)};`).join("\n");
  const rels = fks
    .filter((f) => f.table_name === t)
    .map(
      (f) => `          {
            foreignKeyName: ${JSON.stringify(f.conname)};
            columns: [${f.cols.map((x) => JSON.stringify(x)).join(", ")}];
            isOneToOne: ${f.one_to_one};
            referencedRelation: ${JSON.stringify(f.ref_table)};
            referencedColumns: [${f.ref_cols.map((x) => JSON.stringify(x)).join(", ")}];
          },`,
    )
    .join("\n");
  return `      ${t}: {
        Row: {
${row}
        };
        Insert: {
${ins}
        };
        Update: {
${upd}
        };
        Relationships: [${rels ? `\n${rels}\n        ` : ""}];
      };`;
});

// -------------------------------------------------------------- functions
// Only functions a client role may execute are part of the API surface.
const fns = await q(`
  select p.proname as name, p.pronargs, p.pronargdefaults, p.proretset,
         coalesce(p.proargnames, '{}') as argnames,
         coalesce(p.proargmodes::text[], '{}') as argmodes,
         (select array_agg(t.typname order by o.ord) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality o(oid, ord)
            join pg_type t on t.oid = o.oid) as argtypes,
         rt.typname as rettype, rt.typtype as rettypetype
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public'
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  order by 1`);

const fnBlocks = fns.map((f) => {
  const names = f.argnames;
  const modes = f.argmodes.length ? f.argmodes : Array(f.argtypes?.length ?? 0).fill("i");
  const types = f.argtypes ?? [];
  const inputs = [];
  const outputs = [];
  types.forEach((ty, i) => {
    const m = modes[i] ?? "i";
    if (m === "i" || m === "b") inputs.push({ name: names[i], ty });
    if (m === "t" || m === "o" || m === "b") outputs.push({ name: names[i], ty });
  });
  const firstDefault = inputs.length - f.pronargdefaults;
  const args = inputs.length
    ? `{ ${inputs.map((a, i) => `${a.name}${i >= firstDefault ? "?" : ""}: ${tsType(a.ty)}`).join("; ")} }`
    : "Record<PropertyKey, never>";
  let ret;
  if (outputs.length) {
    ret = `{ ${outputs.map((o) => `${o.name}: ${tsType(o.ty)} | null`).join("; ")} }`;
  } else if (f.rettypetype === "c" && tables.includes(f.rettype)) {
    ret = `Database["public"]["Tables"][${JSON.stringify(f.rettype)}]["Row"]`;
  } else {
    ret = tsType(f.rettype);
  }
  if (f.proretset) ret = `${ret}[]`;
  return `      ${f.name}: {\n        Args: ${args};\n        Returns: ${ret};\n      };`;
});

const out = `// GENERATED by \`npm run gen:types\` from supabase/migrations — do not edit.
// CI fails when this file is out of date with the migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${tableBlocks.join("\n")}
    };
    Views: { [_ in never]: never };
    Functions: {
${fnBlocks.join("\n")}
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type FunctionArgs<F extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][F]["Args"];
export type FunctionReturns<F extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][F]["Returns"];
`;
writeFileSync(OUT, out);
console.log(
  `src/data/database.types.ts ← ${tables.length} tables, ${fns.length} functions, ${Object.keys(enumOf).length} enum columns`,
);
await db.close();
