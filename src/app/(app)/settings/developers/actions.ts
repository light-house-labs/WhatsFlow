"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { encrypt, randomToken } from "@/lib/crypto";
import { newApiKey } from "@/lib/api-auth";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/net-guard";
import { enqueue, kickJobs } from "@/lib/jobs";

// A new secret is shown once, through a short-lived http-only cookie, never in the URL.
async function flashSecret(label: string, value: string) {
  (await cookies()).set("wf_flash_secret", JSON.stringify({ label, value }), { httpOnly: true, sameSite: "strict", path: "/settings/developers", maxAge: 60, secure: process.env.NODE_ENV === "production" });
}

export async function createApiKey(form: FormData) {
  const ctx = await requireOrg("admin");
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "API key";
  const scope = form.get("scope") === "read" ? "read" : "full";
  const k = newApiKey();
  await ctx.db.insert(schema.apiKeys).values({ orgId: ctx.org.id, name, prefix: k.prefix, keyHash: k.hash, scope, createdBy: ctx.user.id });
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action: "api_key.created", target: k.prefix });
  await flashSecret(`API key “${name}”`, k.key);
  redirect("/settings/developers");
}

export async function revokeApiKey(form: FormData) {
  const ctx = await requireOrg("admin");
  await ctx.db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(and(eq(schema.apiKeys.id, String(form.get("id"))), eq(schema.apiKeys.orgId, ctx.org.id)));
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action: "api_key.revoked", target: String(form.get("id")) });
  revalidatePath("/settings/developers");
}

export async function addWebhook(form: FormData) {
  const ctx = await requireOrg("admin");
  const url = String(form.get("url") ?? "").trim();
  const events = WEBHOOK_EVENTS.filter((e) => form.get(`ev_${e}`) === "on") as WebhookEvent[];
  try {
    await assertPublicUrl(url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) redirect(`/settings/developers?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  if (!events.length) redirect("/settings/developers?error=Pick+at+least+one+event");
  const secret = `whsec_${randomToken(24)}`;
  await ctx.db.insert(schema.webhookEndpoints).values({ orgId: ctx.org.id, url, secretEnc: encrypt(secret), events });
  await flashSecret(`Signing secret for ${new URL(url).host}`, secret);
  redirect("/settings/developers");
}

export async function toggleWebhook(form: FormData) {
  const ctx = await requireOrg("admin");
  await ctx.db
    .update(schema.webhookEndpoints)
    .set({ active: form.get("active") === "1" })
    .where(and(eq(schema.webhookEndpoints.id, String(form.get("id"))), eq(schema.webhookEndpoints.orgId, ctx.org.id)));
  revalidatePath("/settings/developers");
}

export async function deleteWebhook(form: FormData) {
  const ctx = await requireOrg("admin");
  await ctx.db.delete(schema.webhookEndpoints).where(and(eq(schema.webhookEndpoints.id, String(form.get("id"))), eq(schema.webhookEndpoints.orgId, ctx.org.id)));
  revalidatePath("/settings/developers");
}

export async function sendTestWebhook(form: FormData) {
  const ctx = await requireOrg("admin");
  const [ep] = await ctx.db.select().from(schema.webhookEndpoints).where(and(eq(schema.webhookEndpoints.id, String(form.get("id"))), eq(schema.webhookEndpoints.orgId, ctx.org.id)));
  if (!ep) return;
  const [del] = await ctx.db
    .insert(schema.webhookDeliveries)
    .values({ endpointId: ep.id, orgId: ctx.org.id, event: "test", payload: { message: "Test delivery from WhatsFlow" } })
    .returning();
  await enqueue(ctx.db, "webhook.deliver", { deliveryId: del.id });
  kickJobs(ctx.db);
  redirect("/settings/developers?tested=1");
}

export async function retryDelivery(form: FormData) {
  const ctx = await requireOrg("admin");
  const [del] = await ctx.db
    .update(schema.webhookDeliveries)
    .set({ status: "pending", attempts: 0 })
    .where(and(eq(schema.webhookDeliveries.id, String(form.get("id"))), eq(schema.webhookDeliveries.orgId, ctx.org.id)))
    .returning();
  if (del) {
    await enqueue(ctx.db, "webhook.deliver", { deliveryId: del.id });
    kickJobs(ctx.db);
  }
  revalidatePath("/settings/developers");
}
