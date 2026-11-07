/**
 * Local and self-hosted servers drain the job queue in-process every few
 * seconds. On Vercel, Vercel Cron calls /api/cron/tick instead (vercel.json).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL || process.env.JOBS_INLINE === "0") return;
  const g = globalThis as unknown as { __wfJobTimer?: NodeJS.Timeout };
  if (g.__wfJobTimer) return;
  const [{ db }, { enqueuePeriodic, runDueJobs }] = await Promise.all([import("./db"), import("./lib/jobs")]);
  let busy = false;
  let ticks = 0;
  g.__wfJobTimer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const d = await db();
      if (ticks++ % 30 === 0) {
        await enqueuePeriodic(d);
      }
      await runDueJobs(d);
    } catch (e) {
      console.error("[jobs]", e);
    } finally {
      busy = false;
    }
  }, 2000);
}
