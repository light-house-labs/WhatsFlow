/* eslint-disable @typescript-eslint/no-explicit-any -- store webhook bodies are untyped JSON, read field by field */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { kickJobs } from "@/lib/jobs";
import { shopifyOrder, storeConfigFor, syncShopifyCheckout, syncStoreOrder, verifyStoreSignature, wooOrder } from "@/lib/stores";

export const dynamic = "force-dynamic";

/**
 * Shopify and WooCommerce webhooks, one URL per workspace, each checked
 * against that workspace's signing secret. Deliveries can repeat; syncing is idempotent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; orgId: string }> }) {
  const { provider, orgId } = await params;
  if (provider !== "shopify" && provider !== "woocommerce") return new NextResponse("unknown store", { status: 404 });
  if (!/^[0-9a-f-]{36}$/.test(orgId)) return new NextResponse("not found", { status: 404 });
  const raw = await req.text();
  const d = await db();
  const cfg = await storeConfigFor(d, orgId, provider);
  if (!cfg) return new NextResponse("not configured", { status: 404 });

  // WooCommerce pings a new webhook with a form body and no signature; accept it so the webhook saves.
  if (provider === "woocommerce" && !req.headers.get("x-wc-webhook-signature") && /^webhook_id=\d+$/.test(raw.trim())) return new NextResponse("ok");

  const sig = provider === "shopify" ? req.headers.get("x-shopify-hmac-sha256") : req.headers.get("x-wc-webhook-signature");
  if (!verifyStoreSignature(raw, sig, cfg.webhookSecret)) return new NextResponse("bad signature", { status: 401 });
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const topic = (provider === "shopify" ? req.headers.get("x-shopify-topic") : req.headers.get("x-wc-webhook-topic")) ?? "";

  let result: unknown = { ignored: topic };
  if (provider === "shopify") {
    if (topic.startsWith("orders/")) result = await syncStoreOrder(d, orgId, "shopify", shopifyOrder(body));
    else if (topic === "checkouts/create" || topic === "checkouts/update") result = { cart: (await syncShopifyCheckout(d, orgId, body, cfg))?.id ?? null };
  } else if (topic.startsWith("order.")) {
    result = await syncStoreOrder(d, orgId, "woocommerce", wooOrder(body));
  }
  kickJobs(d);
  return NextResponse.json(result);
}
