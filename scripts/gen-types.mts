/**
 * Generates src/lib/supabase/database.types.ts for the `crm` schema from the
 * Postgres catalog, in the format supabase-js expects. Works without Docker
 * or a Supabase access token (the Supabase CLI needs one of them).
 *
 * Usage: npm run db:types
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { pgConfigFromEnv } from "./pg-config.mts";

const SCHEMA = "crm";
const OUT = path.join(import.meta.dirname, "..", "src", "lib", "supabase", "database.types.ts");

const SCALARS: Record<string, string> = {
  uuid: "string",
  text: "string",
  bpchar: "string",
  varchar: "string",
  citext: "string",
  timestamptz: "string",
  timestamp: "string",
  date: "string",
  time: "string",
  interval: "string",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  bool: "boolean",
  json: "Json",
  jsonb: "Json",
  bytea: "string",
  void: "undefined",
};

interface Column {
  table_name: string;
  column_name: string;
  udt_name: string;
  udt_schema: string;
  is_nullable: "YES" | "NO";
  has_default: boolean;
  is_identity: "YES" | "NO";
  is_generated: "ALWAYS" | "NEVER";
}

function tsType(udt: string, udtSchema: string, enums: Set<string>): string {
  const isArray = udt.startsWith("_");
  const base = isArray ? udt.slice(1) : udt;
  const t =
    udtSchema === SCHEMA && enums.has(base)
      ? `Database["${SCHEMA}"]["Enums"]["${base}"]`
      : enums.has(base)
        ? `Database["${SCHEMA}"]["Enums"]["${base}"]`
        : (SCALARS[base] ?? "unknown");
  return isArray ? `${t}[]` : t;
}

async function main(): Promise<void> {
  const client = new pg.Client(pgConfigFromEnv());
  await client.connect();
  try {
    const enumRows = (
      await client.query<{ name: string; values: string[] }>(
        `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder)::text[] as values
         from pg_type t join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = $1 group by t.typname order by t.typname`,
        [SCHEMA],
      )
    ).rows;
    const enums = new Set(enumRows.map((e) => e.name));

    const columns = (
      await client.query<Column>(
        `select c.table_name, c.column_name, c.udt_name, c.udt_schema, c.is_nullable,
                (c.column_default is not null) as has_default, c.is_identity, c.is_generated
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = $1 and t.table_type = 'BASE TABLE'
         order by c.table_name, c.ordinal_position`,
        [SCHEMA],
      )
    ).rows;

    const fks = (
      await client.query<{ name: string; table: string; columns: string[]; ref_table: string; ref_columns: string[] }>(
        `select con.conname as name, src.relname as table,
                array(select a.attname from unnest(con.conkey) k join pg_attribute a
                      on a.attrelid = con.conrelid and a.attnum = k)::text[] as columns,
                ref.relname as ref_table,
                array(select a.attname from unnest(con.confkey) k join pg_attribute a
                      on a.attrelid = con.confrelid and a.attnum = k)::text[] as ref_columns
         from pg_constraint con
         join pg_class src on src.oid = con.conrelid
         join pg_namespace n on n.oid = src.relnamespace
         join pg_class ref on ref.oid = con.confrelid
         join pg_namespace rn on rn.oid = ref.relnamespace
         where con.contype = 'f' and n.nspname = $1 and rn.nspname = $1
         order by con.conname`,
        [SCHEMA],
      )
    ).rows;

    const functions = (
      await client.query<{
        name: string;
        arg_names: string[] | null;
        arg_types: string[];
        arg_schemas: string[];
        ret_type: string;
        ret_schema: string;
        returns_set: boolean;
        n_defaults: number;
        ret_is_table: boolean;
        table_cols: { name: string; type: string; schema: string }[] | null;
      }>(
        `select p.proname as name,
                p.proargnames::text[] as arg_names,
                array(select t.typname from unnest(p.proargtypes) with ordinality a(oid, i)
                      join pg_type t on t.oid = a.oid order by i)::text[] as arg_types,
                array(select tn.nspname from unnest(p.proargtypes) with ordinality a(oid, i)
                      join pg_type t on t.oid = a.oid join pg_namespace tn on tn.oid = t.typnamespace
                      order by i)::text[] as arg_schemas,
                rt.typname as ret_type, rn.nspname as ret_schema, p.proretset as returns_set,
                p.pronargdefaults::int as n_defaults, (rt.typtype = 'c' and rn.nspname = n.nspname) as ret_is_table,
                case when p.proallargtypes is not null then (
                  select json_agg(json_build_object('name', p.proargnames[i], 'type', t.typname, 'schema', tn.nspname) order by i)
                  from unnest(p.proallargtypes, p.proargmodes) with ordinality a(oid, mode, i)
                  join pg_type t on t.oid = a.oid join pg_namespace tn on tn.oid = t.typnamespace
                  where a.mode = 't'
                ) end as table_cols
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_type rt on rt.oid = p.prorettype
         join pg_namespace rn on rn.oid = rt.typnamespace
         where n.nspname = $1 and p.prokind = 'f'
         order by p.proname`,
        [SCHEMA],
      )
    ).rows;

    const byTable = new Map<string, Column[]>();
    for (const c of columns) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c]);

    const out: string[] = [];
    out.push("// Generated by scripts/gen-types.mts. Do not edit by hand. Run `npm run db:types`.");
    out.push("");
    out.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];");
    out.push("");
    out.push("export type Database = {");
    out.push(`  ${SCHEMA}: {`);
    out.push("    Tables: {");
    for (const [table, cols] of byTable) {
      const row = cols.map((c) => {
        const t = tsType(c.udt_name, c.udt_schema, enums);
        return `${c.column_name}: ${t}${c.is_nullable === "YES" ? " | null" : ""}`;
      });
      const insert = cols
        .filter((c) => c.is_generated !== "ALWAYS")
        .map((c) => {
          const t = tsType(c.udt_name, c.udt_schema, enums);
          const optional = c.is_nullable === "YES" || c.has_default || c.is_identity === "YES";
          return `${c.column_name}${optional ? "?" : ""}: ${t}${c.is_nullable === "YES" ? " | null" : ""}`;
        });
      const update = insert.map((l) => l.replace(/^(\w+)\??:/, "$1?:"));
      const rels = fks
        .filter((f) => f.table === table)
        .map(
          (f) =>
            `{ foreignKeyName: "${f.name}"; columns: [${f.columns.map((c) => `"${c}"`).join(", ")}]; isOneToOne: false; referencedRelation: "${f.ref_table}"; referencedColumns: [${f.ref_columns.map((c) => `"${c}"`).join(", ")}] }`,
        );
      out.push(`      ${table}: {`);
      out.push(`        Row: { ${row.join("; ")} };`);
      out.push(`        Insert: { ${insert.join("; ")} };`);
      out.push(`        Update: { ${update.join("; ")} };`);
      out.push(`        Relationships: [${rels.join(", ")}];`);
      out.push("      };");
    }
    out.push("    };");
    out.push("    Views: { [_ in never]: never };");
    out.push("    Functions: {");
    for (const f of functions) {
      const names = f.arg_names ?? [];
      const firstOptional = f.arg_types.length - f.n_defaults;
      const args = f.arg_types.map(
        (t, i) => `${names[i] ?? `arg${i}`}${i >= firstOptional ? "?" : ""}: ${tsType(t, f.arg_schemas[i] ?? "", enums)}`,
      );
      let ret: string;
      if (f.table_cols && f.table_cols.length > 0) {
        ret = `{ ${f.table_cols.map((c) => `${c.name}: ${tsType(c.type, c.schema, enums)}`).join("; ")} }[]`;
      } else if (f.ret_is_table) {
        ret = `Database["${SCHEMA}"]["Tables"]["${f.ret_type}"]["Row"]${f.returns_set ? "[]" : ""}`;
      } else {
        ret = tsType(f.ret_type, f.ret_schema, enums) + (f.returns_set ? "[]" : "");
      }
      if (f.ret_type === "trigger") continue;
      out.push(`      ${f.name}: { Args: { ${args.join("; ")} }; Returns: ${ret} };`);
    }
    out.push("    };");
    out.push("    Enums: {");
    for (const e of enumRows) out.push(`      ${e.name}: ${e.values.map((v) => `"${v}"`).join(" | ")};`);
    out.push("    };");
    out.push("    CompositeTypes: { [_ in never]: never };");
    out.push("  };");
    out.push("};");
    out.push("");
    out.push(`type Schema = Database["${SCHEMA}"];`);
    out.push('export type Tables<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Row"];');
    out.push('export type TablesInsert<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Insert"];');
    out.push('export type TablesUpdate<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Update"];');
    out.push('export type Enums<T extends keyof Schema["Enums"]> = Schema["Enums"][T];');
    out.push("");

    await writeFile(OUT, out.join("\n"));
    console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${byTable.size} tables, ${functions.length} functions).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
