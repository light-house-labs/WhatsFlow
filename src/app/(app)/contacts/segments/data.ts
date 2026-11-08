import { sql } from "drizzle-orm";
import type { DB } from "@/db";

const rows = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));

/** Tags and custom field names in use, for the builder's suggestions. */
export async function builderOptions(d: DB, orgId: string) {
  const [tagRows, fieldRows] = await Promise.all([
    d.execute(sql`select t as tag from contacts, unnest(tags) t where org_id = ${orgId} group by t order by count(*) desc limit 100`),
    d.execute(sql`select distinct jsonb_object_keys(custom_fields) as k from contacts where org_id = ${orgId} limit 50`),
  ]);
  return { tags: rows<{ tag: string }>(tagRows).map((r) => r.tag), fields: rows<{ k: string }>(fieldRows).map((r) => r.k) };
}
