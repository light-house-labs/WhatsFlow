"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { AutomationStep, AutomationTrigger } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { limitsFor } from "@/lib/plans";

const TRIGGERS = ["conversation_started", "order_created", "order_paid", "appointment_booked", "lead_won", "no_reply", "cart_abandoned"] as const;

const Step = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wait"), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
  z.object({ type: z.literal("send_text"), text: z.string().trim().min(1).max(4096) }),
  z.object({ type: z.literal("send_template"), templateId: z.string().uuid(), variables: z.array(z.string().trim().regex(/^[a-z_]+$/, "Template variables are names like order_number")).max(10).optional() }),
  z.object({ type: z.literal("add_tag"), tag: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("assign"), userId: z.string().uuid() }),
  z.object({ type: z.literal("if_tag"), tag: z.string().trim().min(1).max(40) }),
]);
const Input = z.object({
  name: z.string().trim().min(1).max(80),
  trigger: z.enum(TRIGGERS),
  minutes: z.number().int().min(5).max(60 * 24 * 7).optional(),
  steps: z.array(Step).min(1).max(20),
  live: z.boolean(),
});

export async function createAutomation() {
  const ctx = await requireOrg("admin");
  const [a] = await ctx.db
    .insert(schema.automations)
    .values({ orgId: ctx.org.id, name: "New automation", trigger: "order_paid", steps: [{ type: "send_text", text: "Thanks for your order, {name}!" }] })
    .returning();
  redirect(`/automations/${a.id}`);
}

export async function saveAutomation(id: string, input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireOrg("admin");
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the steps." };
  const v = parsed.data;
  if (v.live) {
    const [{ n }] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.automations)
      .where(and(eq(schema.automations.orgId, ctx.org.id), eq(schema.automations.status, "live"), sql`${schema.automations.id} <> ${id}`));
    if (Number(n) >= limitsFor(ctx.org.plan).automations) return { ok: false, error: `Your plan allows ${limitsFor(ctx.org.plan).automations} live automations.` };
  }
  await ctx.db
    .update(schema.automations)
    .set({
      name: v.name,
      trigger: v.trigger as AutomationTrigger,
      triggerConfig: v.trigger === "no_reply" ? { minutes: v.minutes ?? 120 } : {},
      steps: v.steps as AutomationStep[],
      status: v.live ? "live" : "draft",
      updatedAt: new Date(),
    })
    .where(and(eq(schema.automations.id, id), eq(schema.automations.orgId, ctx.org.id)));
  revalidatePath("/automations");
  return { ok: true };
}

export async function deleteAutomation(form: FormData) {
  const ctx = await requireOrg("admin");
  await ctx.db.delete(schema.automations).where(and(eq(schema.automations.id, String(form.get("id"))), eq(schema.automations.orgId, ctx.org.id)));
  redirect("/automations");
}
