import { headers } from "next/headers";
import { lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";

export type RateResult = { ok: boolean; limit: number; remaining: number; resetAt: Date };

/**
 * Count one hit against `bucket` in a fixed window. Stored in the database so
 * every serverless instance sees the same count.
 */
export async function hit(d: DB, bucket: string, limit: number, windowSeconds: number, now = Date.now()): Promise<RateResult> {
  const start = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await d
    .insert(schema.rateLimits)
    .values({ bucket, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [schema.rateLimits.bucket, schema.rateLimits.windowStart],
      set: { count: sql`${schema.rateLimits.count} + 1` },
    })
    .returning({ count: schema.rateLimits.count });
  const resetAt = new Date(start.getTime() + windowSeconds * 1000);
  return { ok: row.count <= limit, limit, remaining: Math.max(0, limit - row.count), resetAt };
}

/** Drop windows older than a day. Run from the periodic jobs. */
export async function pruneRateLimits(d: DB) {
  await d.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, new Date(Date.now() - 86_400_000)));
}

/** The caller's IP, as reported by the proxy in front of the app. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export function retryAfter(r: RateResult) {
  return Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
}
