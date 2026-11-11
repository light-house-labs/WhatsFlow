"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { aiSettingsFor } from "@/lib/ai";

export async function saveAiSettings(form: FormData) {
  const ctx = await requireOrg("admin");
  await aiSettingsFor(ctx.db, ctx.org.id);
  const section = String(form.get("section"));
  let set: Partial<typeof schema.aiSettings.$inferInsert> = {};
  if (section === "replies") {
    set = {
      enabled: form.get("enabled") === "on",
      businessInfo: String(form.get("businessInfo") ?? "").slice(0, 20_000),
      faqs: String(form.get("faqs") ?? "").slice(0, 50_000),
    };
  } else if (section === "catalog") {
    set = { includeCatalog: form.get("includeCatalog") === "on" };
  } else if (section === "handover") {
    set = {
      handoverKeywords: String(form.get("handoverKeywords") ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 30),
      maxReplies: Math.max(1, Math.min(50, Number(form.get("maxReplies")) || 6)),
    };
  } else return;
  await ctx.db.update(schema.aiSettings).set(set).where(eq(schema.aiSettings.orgId, ctx.org.id));
  revalidatePath("/settings/ai");
}
