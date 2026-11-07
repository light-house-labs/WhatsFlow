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

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const db = drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory") (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
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
