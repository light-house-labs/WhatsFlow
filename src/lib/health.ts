import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { rowsOf } from "@/db";

export type CheckState = "ok" | "degraded" | "down";
export type Check = { id: string; name: string; state: CheckState; detail: string };

const worst = (a: CheckState, b: CheckState): CheckState => (a === "down" || b === "down" ? "down" : a === "degraded" || b === "degraded" ? "degraded" : "ok");

/**
 * Platform health from our own data, for the public status page. Only
 * platform-wide numbers: nothing here identifies a workspace or a customer.
 */
export async function healthChecks(d: DB): Promise<{ state: CheckState; checks: Check[]; checkedAt: string }> {
  const checks: Check[] = [];
  const t0 = Date.now();
  try {
    await d.execute(sql`select 1`);
    const ms = Date.now() - t0;
    checks.push({ id: "app", name: "App and inbox", state: ms > 2000 ? "degraded" : "ok", detail: ms > 2000 ? "Responding slowly." : "Working normally." });
  } catch {
    return { state: "down", checks: [{ id: "app", name: "App and inbox", state: "down", detail: "We can't reach our database." }], checkedAt: new Date().toISOString() };
  }

  // Background work (campaign sends, reminders, automations) is late when due jobs sit unclaimed.
  const [jobs] = rowsOf<{ late: number; oldest: number | null }>(
    await d.execute(sql`select count(*)::int as late, extract(epoch from now() - min(run_at))::int as oldest from jobs where done_at is null and run_at < now() - interval '5 minutes' and (locked_until is null or locked_until < now())`),
  );
  const lateMin = Math.round(Number(jobs?.oldest ?? 0) / 60);
  checks.push({
    id: "jobs",
    name: "Broadcasts, reminders and automations",
    state: !jobs?.late ? "ok" : lateMin > 30 ? "down" : "degraded",
    detail: !jobs?.late ? "Running on time." : `Running about ${lateMin} minutes behind.`,
  });

  // Sending: the share of outbound messages that failed in the last 15 minutes.
  const [sent] = rowsOf<{ total: number; failed: number }>(
    await d.execute(sql`select count(*)::int as total, count(*) filter (where status = 'failed')::int as failed from messages where direction = 'out' and created_at > now() - interval '15 minutes'`),
  );
  const total = Number(sent?.total ?? 0);
  const failRate = total ? Number(sent.failed) / total : 0;
  checks.push({
    id: "sending",
    name: "Sending WhatsApp messages",
    state: total >= 20 && failRate > 0.5 ? "down" : total >= 20 && failRate > 0.15 ? "degraded" : "ok",
    detail: total >= 20 && failRate > 0.15 ? `${Math.round(failRate * 100)}% of messages in the last 15 minutes failed.` : "Working normally.",
  });

  return { state: checks.reduce<CheckState>((s, c) => worst(s, c.state), "ok"), checks, checkedAt: new Date().toISOString() };
}
