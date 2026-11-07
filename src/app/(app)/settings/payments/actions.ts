"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

export async function savePaymentProvider(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind"));
  const v = (k: string) => String(form.get(k) ?? "").trim();
  let config: Record<string, string>;
  let label: string;
  if (kind === "razorpay") {
    if (!/^rzp_(test|live)_\w+$/.test(v("keyId")) || !v("keySecret") || !v("webhookSecret")) redirect("/settings/payments?error=razorpay");
    config = { keyId: v("keyId"), keySecret: v("keySecret"), webhookSecret: v("webhookSecret") };
    label = `${v("keyId").slice(0, 9)}…${v("keyId").slice(-4)}`;
  } else if (kind === "stripe") {
    if (!/^(sk|rk)_(test|live)_\w+$/.test(v("secretKey")) || !v("webhookSecret").startsWith("whsec_")) redirect("/settings/payments?error=stripe");
    config = { secretKey: v("secretKey"), webhookSecret: v("webhookSecret") };
    label = `${v("secretKey").slice(0, 8)}…${v("secretKey").slice(-4)}`;
  } else return;
  await ctx.db
    .insert(schema.integrations)
    .values({ orgId: ctx.org.id, kind, configEnc: encrypt(JSON.stringify(config)), label })
    .onConflictDoUpdate({ target: [schema.integrations.orgId, schema.integrations.kind], set: { configEnc: encrypt(JSON.stringify(config)), label, active: true } });
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action: "payments.connected", target: kind });
  revalidatePath("/settings/payments");
  redirect("/settings/payments?saved=1");
}

export async function removePaymentProvider(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind")) as "razorpay" | "stripe";
  await ctx.db.delete(schema.integrations).where(and(eq(schema.integrations.orgId, ctx.org.id), eq(schema.integrations.kind, kind)));
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action: "payments.removed", target: kind });
  revalidatePath("/settings/payments");
}
