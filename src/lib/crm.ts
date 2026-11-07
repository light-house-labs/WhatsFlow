import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";

export async function nextTicketNumber(d: DB, orgId: string): Promise<number> {
  const [r] = await d
    .select({ n: sql<number>`coalesce(max(${schema.tickets.number}), 1000) + 1` })
    .from(schema.tickets)
    .where(eq(schema.tickets.orgId, orgId));
  return Number(r?.n ?? 1001);
}
