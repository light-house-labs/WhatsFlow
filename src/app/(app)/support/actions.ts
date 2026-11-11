"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg, requireUser } from "@/lib/auth";

export async function openThread(form: FormData): Promise<{ error: string } | undefined> {
  const ctx = await requireOrg();
  const body = String(form.get("body") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim() || body.slice(0, 60);
  if (!body) return { error: "Write your question first." };
  const [t] = await ctx.db.insert(schema.supportThreads).values({ orgId: ctx.org.id, userId: ctx.user.id, subject }).returning();
  await ctx.db.insert(schema.supportMessages).values({ threadId: t.id, fromStaff: false, authorId: ctx.user.id, body });
  redirect(`/support?t=${t.id}`);
}

export async function reply(form: FormData): Promise<{ error: string } | undefined> {
  const s = await requireUser();
  const threadId = String(form.get("threadId"));
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  const d = (await import("@/db")).db;
  const db = await d();
  const [t] = await db.select().from(schema.supportThreads).where(eq(schema.supportThreads.id, threadId)).limit(1);
  if (!t) return;
  const staff = s.user.isStaff;
  if (!staff) {
    const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, t.orgId), eq(schema.memberships.userId, s.user.id))).limit(1);
    if (!m) return;
  }
  await db.insert(schema.supportMessages).values({ threadId, fromStaff: staff, authorId: s.user.id, body });
  await db.update(schema.supportThreads).set({ status: staff ? "answered" : "open", updatedAt: new Date() }).where(eq(schema.supportThreads.id, threadId));
  revalidatePath("/support");
  revalidatePath("/support/staff");
}
