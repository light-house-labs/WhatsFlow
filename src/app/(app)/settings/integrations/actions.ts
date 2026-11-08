"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { StoreKind } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { storeConfigFor, type StoreConfig } from "@/lib/stores";

export async function saveStore(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind")) as StoreKind;
  const v = (k: string) => String(form.get(k) ?? "").trim();
  let storeUrl = v("storeUrl").replace(/\/+$/, "");
  if (kind === "shopify") {
    storeUrl = storeUrl.replace(/^https?:\/\//, "");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(storeUrl)) redirect("/settings/integrations?error=shopify");
  } else if (kind === "woocommerce") {
    if (!/^https:\/\/[^\s/]+/i.test(storeUrl)) redirect("/settings/integrations?error=woocommerce");
  } else return;
  // a blank secret keeps the saved one
  const webhookSecret = v("webhookSecret") || (await storeConfigFor(ctx.db, ctx.org.id, kind))?.webhookSecret || "";
  if (webhookSecret.length < 16) redirect(`/settings/integrations?error=${kind}-secret`);
  const config: StoreConfig = {
    storeUrl,
    webhookSecret,
    cartMinutes: Math.min(24 * 60, Math.max(15, Number(v("cartMinutes")) || 60)),
    cartConsentOnly: form.get("cartConsentOnly") === "on",
  };
  const label = storeUrl.replace(/^https:\/\//, "");
  await ctx.db
    .insert(schema.integrations)
    .values({ orgId: ctx.org.id, kind, configEnc: encrypt(JSON.stringify(config)), label })
    .onConflictDoUpdate({ target: [schema.integrations.orgId, schema.integrations.kind], set: { configEnc: encrypt(JSON.stringify(config)), label, active: true } });
  await audit(ctx, "store.connected", label, { kind });
  revalidatePath("/settings/integrations");
  redirect(`/settings/integrations?saved=${kind}`);
}

export async function removeStore(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind"));
  if (kind !== "shopify" && kind !== "woocommerce") return;
  await ctx.db.delete(schema.integrations).where(and(eq(schema.integrations.orgId, ctx.org.id), eq(schema.integrations.kind, kind)));
  await audit(ctx, "store.disconnected", kind);
  revalidatePath("/settings/integrations");
}
