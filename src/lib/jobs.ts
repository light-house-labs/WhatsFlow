import { after } from "next/server";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { hit } from "./rate-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each handler reads its own payload shape
export type JobHandler = (d: DB, payload: Record<string, any>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler) {
  handlers.set(kind, handler);
}

export async function enqueue(d: DB, kind: string, payload: Record<string, unknown>, delayMs = 0) {
  await d.insert(schema.jobs).values({ kind, payload, runAt: new Date(Date.now() + delayMs) });
}

const MAX_ATTEMPTS = 5;
// Long enough for a full campaign batch on a slow day: a second runner claiming
// the same job mid-flight would message the same people twice.
const LOCK_MS = 5 * 60_000;

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
      .set({ lockedUntil: new Date(Date.now() + LOCK_MS), attempts: sql`${schema.jobs.attempts} + 1` })
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
      // the run that held the lock died (timeout, crash) every time: stop retrying
      if (job.attempts >= MAX_ATTEMPTS) throw new Error(job.error ?? "Gave up: the job never finished");
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

/** Run `fn` once the response is sent. Serverless hosts freeze a bare timer; `after` keeps the function alive. */
function defer(fn: () => Promise<unknown>) {
  const run = () => fn().catch((e) => console.error("[jobs]", e));
  try {
    after(run);
  } catch {
    setTimeout(run, 0); // not in a request: scripts, tests, the in-process timer
  }
}

/** Drain the queue after enqueueing, so nothing waits for the next cron tick. */
export function kickJobs(d: DB) {
  defer(() => runDueJobs(d));
}

const PERIODIC = ["lead.followups", "billing.period_end", "automation.no_reply", "ratelimits.prune", "sheets.sync"];

/** Housekeeping jobs queued by cron, the in-process timer (dev), or `heartbeat`. One of each kind at a time. */
export async function enqueuePeriodic(d: DB) {
  const waiting = await d.select({ kind: schema.jobs.kind }).from(schema.jobs).where(and(isNull(schema.jobs.doneAt), inArray(schema.jobs.kind, PERIODIC)));
  const have = new Set(waiting.map((j) => j.kind));
  for (const kind of PERIODIC) if (!have.has(kind)) await enqueue(d, kind, {});
}

let lastBeat = 0;

/**
 * Keeps time without a per-minute cron (Vercel's free plan only runs cron daily):
 * app traffic and incoming webhooks call this, and at most once a minute across
 * all instances it queues the periodic jobs and drains the queue.
 */
export function heartbeat(d: DB) {
  if (!process.env.VERCEL && process.env.JOBS_INLINE !== "0") return; // the in-process timer does this
  if (Date.now() - lastBeat < 60_000) return;
  lastBeat = Date.now();
  defer(async () => {
    if (!(await hit(d, "jobs:heartbeat", 1, 60)).ok) return;
    await enqueuePeriodic(d);
    await runDueJobs(d, 50);
  });
}
