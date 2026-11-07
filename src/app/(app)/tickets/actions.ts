"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { sendInConversation, SendError } from "@/lib/wa/outbound";

export async function updateTicket(form: FormData) {
  const ctx = await requireOrg();
  const id = String(form.get("id"));
  const status = String(form.get("status")) as "open" | "pending" | "resolved" | "closed";
  const [before] = await ctx.db.select().from(schema.tickets).where(and(eq(schema.tickets.id, id), eq(schema.tickets.orgId, ctx.org.id))).limit(1);
  if (!before) return;
  const due = String(form.get("dueAt") ?? "");
  await ctx.db
    .update(schema.tickets)
    .set({
      status,
      priority: String(form.get("priority")) as "normal",
      assigneeId: String(form.get("assigneeId") ?? "") || null,
      subject: String(form.get("subject") ?? before.subject).trim() || before.subject,
      description: String(form.get("description") ?? "") || null,
      dueAt: due ? new Date(due) : null,
      resolvedAt: status === "resolved" || status === "closed" ? (before.resolvedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tickets.id, id));

  // Tell the customer when it's resolved, if we're allowed to message them freely.
  if (form.get("notify") === "on" && status === "resolved" && before.status !== "resolved" && before.conversationId) {
    try {
      await sendInConversation(
        ctx.db,
        before.conversationId,
        { kind: "text", body: `Good news: your request #${before.number} (“${before.subject}”) is resolved. Reply here if anything's still not right.` },
        { senderKind: "user", senderUserId: ctx.user.id },
      );
    } catch (e) {
      if (!(e instanceof SendError)) throw e;
    }
  }
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}
