import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// One connection per server process, kept across dev hot reloads.
const g = globalThis as unknown as { __wfDb?: Promise<DB> };

/**
 * Hosted Postgres (Supabase, Neon) needs TLS. Remote hosts always get verified
 * TLS; set DATABASE_CA to the provider's CA certificate when it isn't in Node's
 * trust store (Supabase: Project Settings > Database > SSL certificate).
 * A `sslmode` in the URL is dropped so it can't override this.
 */
function poolConfig(raw: string) {
  const u = new URL(raw);
  u.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  const ca = process.env.DATABASE_CA?.replace(/\\n/g, "\n");
  return { connectionString: u.toString(), ssl: local ? false : ca ? { ca } : true, max: Number(process.env.DATABASE_POOL_MAX ?? 5) };
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const db = drizzlePg(new Pool(poolConfig(url)), { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  // Serverless file systems are read-only and per-instance, so the embedded
  // database can't work there. Fail with a clear message instead of ENOENT.
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set for this Vercel environment. Add it in Project Settings > Environment Variables and redeploy.");
  }
  const [{ PGlite }, { pg_trgm }, { unaccent }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/contrib/pg_trgm"),
    import("@electric-sql/pglite/contrib/unaccent"),
  ]);
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory") (await import("node:fs")).mkdirSync(dir, { recursive: true });
  // Search (migration 0006) needs these two; on real Postgres they ship as contrib.
  const extensions = { pg_trgm, unaccent };
  const client = dir === "memory" ? new PGlite({ extensions }) : new PGlite(dir, { extensions });
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  // Both drivers expose the same query builder; type as one of them.
  return db as unknown as DB;
}

export function db(): Promise<DB> {
  g.__wfDb ??= connect().catch((e) => {
    g.__wfDb = undefined; // retry on the next call instead of caching the failure
    throw e;
  });
  return g.__wfDb;
}

export { schema };

/** Rows from `db.execute`, whichever driver is in use. */
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows?: T[] }).rows ?? (result as T[]);
}
