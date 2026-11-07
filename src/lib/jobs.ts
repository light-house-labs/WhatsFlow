import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";

export type JobHandler = (d: DB, payload: Record<string, any>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler) {
  handlers.set(kind, handler);
}

export async function enqueue(d: DB, kind: string, payload: Record<string, unknown>, delayMs = 0) {
  await d.insert(schema.jobs).values({ kind, payload, runAt: new Date(Date.now() + delayMs) });
}

const MAX_ATTEMPTS = 5;

/** Run due jobs. Safe to call from many places: each job is claimed with a lock. */
export async function runDueJobs(d: DB, limit = 25): Promise<number> {
  await import("./job-handlers"); // registers handlers
  const now = new Date();
  const due = await d
    .select()
    .from(schema.jobs)
    .where(
      and(
        isNull(schema.jobs.doneAt),
        lte(schema.jobs.runAt, now),
        or(isNull(schema.jobs.lockedUntil), lte(schema.jobs.lockedUntil, now)),
      ),
    )
    .orderBy(asc(schema.jobs.runAt))
    .limit(limit);
  let ran = 0;
  for (const job of due) {
    const claimed = await d
      .update(schema.jobs)
      .set({ lockedUntil: new Date(Date.now() + 60_000), attempts: sql`${schema.jobs.attempts} + 1` })
      .where(
        and(
          eq(schema.jobs.id, job.id),
          or(isNull(schema.jobs.lockedUntil), lte(schema.jobs.lockedUntil, now)),
        ),
      )
      .returning({ id: schema.jobs.id });
    if (!claimed.length) continue;
    const handler = handlers.get(job.kind);
    try {
      if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
      await handler(d, job.payload);
      await d.update(schema.jobs).set({ doneAt: new Date(), error: null }).where(eq(schema.jobs.id, job.id));
      ran++;
    } catch (e) {
      const attempts = job.attempts + 1;
      await d
        .update(schema.jobs)
        .set({
          error: (e as Error).message,
          lockedUntil: null,
          // exponential backoff; give up (mark done with error) after MAX_ATTEMPTS
          runAt: new Date(Date.now() + 2 ** attempts * 5_000),
          doneAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
        })
        .where(eq(schema.jobs.id, job.id));
    }
  }
  return ran;
}

/** Fire-and-forget drain after enqueueing, so dev and low-traffic prod don't wait for cron. */
export function kickJobs(d: DB) {
  setTimeout(() => {
    runDueJobs(d).catch((e) => console.error("[jobs]", e));
  }, 0);
}
