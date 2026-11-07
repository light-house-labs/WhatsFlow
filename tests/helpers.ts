import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { createWorkspace } from "@/lib/org-setup";
import { hashPassword } from "@/lib/crypto";
import { handleInbound } from "@/lib/wa/inbound";
import { runDueJobs } from "@/lib/jobs";

let n = 0;

export async function makeOrg(name = "Test Clinic") {
  const d = await db();
  n++;
  const [user] = await d
    .insert(schema.users)
    .values({ email: `owner${n}-${Date.now()}@example.test`, name: "Owner", passwordHash: await hashPassword("pw-123456") })
    .returning();
  const org = await createWorkspace(d, user.id, name, "Clinic or healthcare");
  const [number] = await d.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, org.id));
  return { d, user, org, number };
}

let msgSeq = 0;
export async function customerSays(number: typeof schema.waNumbers.$inferSelect, from: string, text: string, replyId?: string) {
  const d = await db();
  return handleInbound(d, number, {
    waMessageId: `test.${Date.now()}.${msgSeq++}`,
    from,
    profileName: "Asha Kumar",
    type: replyId ? "interactive" : "text",
    text,
    replyId,
    timestamp: new Date(),
  });
}

export async function drainJobs() {
  const d = await db();
  for (let i = 0; i < 10; i++) {
    await d.update(schema.jobs).set({ runAt: new Date(0) }).where(isNull(schema.jobs.doneAt));
    const ran = await runDueJobs(d, 100);
    if (!ran) break;
  }
}
