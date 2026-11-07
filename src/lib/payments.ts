/* eslint-disable @typescript-eslint/no-explicit-any -- Razorpay and Stripe responses are untyped JSON, read field by field */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { PaymentProviderKind } from "@/db/schema";
import { decrypt } from "./crypto";

export type PaymentLinkInput = {
  orderId: string;
  orderNumber: number;
  amountMinor: number;
  currency: string;
  description: string;
  customerName: string | null;
  customerPhone: string;
};
export type PaymentLink = { provider: PaymentProviderKind; ref: string; url: string };

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string };
export type StripeConfig = { secretKey: string; webhookSecret: string };

export class PaymentError extends Error {}

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Sandbox links are allowed anywhere except production, unless explicitly enabled. */
export function sandboxPaymentsAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENTS_SANDBOX === "1";
}

export async function razorpayLink(cfg: RazorpayConfig, p: PaymentLinkInput): Promise<PaymentLink> {
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: p.amountMinor,
      currency: p.currency,
      description: p.description.slice(0, 2048),
      reference_id: p.orderId,
      customer: { name: p.customerName ?? undefined, contact: `+${p.customerPhone}` },
      notify: { sms: false, email: false },
      notes: { order_id: p.orderId },
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new PaymentError(json?.error?.description ?? `Razorpay ${res.status}`);
  return { provider: "razorpay", ref: json.id, url: json.short_url };
}

export async function stripeLink(cfg: StripeConfig, p: PaymentLinkInput): Promise<PaymentLink> {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": p.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(p.amountMinor),
    "line_items[0][price_data][product_data][name]": p.description.slice(0, 250),
    "metadata[order_id]": p.orderId,
    "payment_intent_data[metadata][order_id]": p.orderId,
    success_url: `${appUrl()}/pay/done`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new PaymentError(json?.error?.message ?? `Stripe ${res.status}`);
  return { provider: "stripe", ref: json.id, url: json.url };
}

export function sandboxLink(p: PaymentLinkInput): PaymentLink {
  return { provider: "sandbox", ref: `sbx_${p.orderId}`, url: `${appUrl()}/pay/${p.orderId}` };
}

/** The workspace's payment integration, decrypted. Razorpay wins if both are set. */
export async function paymentConfig(d: DB, orgId: string) {
  const rows = await d
    .select()
    .from(schema.integrations)
    .where(and(eq(schema.integrations.orgId, orgId), eq(schema.integrations.active, true)));
  const rzp = rows.find((r) => r.kind === "razorpay");
  if (rzp) return { kind: "razorpay" as const, cfg: JSON.parse(decrypt(rzp.configEnc)) as RazorpayConfig };
  const stripe = rows.find((r) => r.kind === "stripe");
  if (stripe) return { kind: "stripe" as const, cfg: JSON.parse(decrypt(stripe.configEnc)) as StripeConfig };
  return null;
}

export async function webhookSecretFor(d: DB, orgId: string, kind: "razorpay" | "stripe") {
  const [row] = await d
    .select()
    .from(schema.integrations)
    .where(and(eq(schema.integrations.orgId, orgId), eq(schema.integrations.kind, kind)))
    .limit(1);
  if (!row) return null;
  return (JSON.parse(decrypt(row.configEnc)) as { webhookSecret: string }).webhookSecret || null;
}

export async function createPaymentLink(d: DB, orgId: string, p: PaymentLinkInput): Promise<PaymentLink> {
  const cfg = await paymentConfig(d, orgId);
  if (cfg?.kind === "razorpay") return razorpayLink(cfg.cfg, p);
  if (cfg?.kind === "stripe") return stripeLink(cfg.cfg, p);
  if (sandboxPaymentsAllowed()) return sandboxLink(p);
  throw new PaymentError("Connect Razorpay or Stripe in Settings → Payments to send payment links.");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Razorpay signs the raw body with HMAC-SHA256 in X-Razorpay-Signature. */
export function verifyRazorpay(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  return safeEqual(createHmac("sha256", secret).update(raw).digest("hex"), signature);
}

/** Stripe-Signature: t=<unix>,v1=<hex HMAC of "t.body">. Rejects stale timestamps. */
export function verifyStripe(raw: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some((s) => safeEqual(expected, s));
}
