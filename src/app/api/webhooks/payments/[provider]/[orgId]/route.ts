/* eslint-disable @typescript-eslint/no-explicit-any -- provider webhook bodies are untyped JSON, read field by field */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { markPaid } from "@/lib/orders";
import { verifyRazorpay, verifyStripe, webhookSecretFor } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Payment provider webhooks, one URL per workspace so each is checked against
 * that workspace's own signing secret. Duplicate deliveries are harmless.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; orgId: string }> }) {
  const { provider, orgId } = await params;
  if (provider !== "razorpay" && provider !== "stripe") return new NextResponse("unknown provider", { status: 404 });
  if (!/^[0-9a-f-]{36}$/.test(orgId)) return new NextResponse("not found", { status: 404 });
  const raw = await req.text();
  const d = await db();
  const secret = await webhookSecretFor(d, orgId, provider);
  if (!secret) return new NextResponse("not configured", { status: 404 });
  const ok =
    provider === "razorpay"
      ? verifyRazorpay(raw, req.headers.get("x-razorpay-signature"), secret)
      : verifyStripe(raw, req.headers.get("stripe-signature"), secret);
  if (!ok) return new NextResponse("bad signature", { status: 401 });

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  let orderId: string | null = null;
  if (provider === "razorpay" && body.event === "payment_link.paid") {
    orderId = body.payload?.payment_link?.entity?.reference_id ?? body.payload?.payment_link?.entity?.notes?.order_id ?? null;
  }
  if (provider === "stripe" && body.type === "checkout.session.completed" && body.data?.object?.payment_status === "paid") {
    orderId = body.data.object.metadata?.order_id ?? null;
  }
  if (orderId && /^[0-9a-f-]{36}$/.test(orderId)) {
    const [o] = await d
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId), eq(schema.orders.paymentProvider, provider)))
      .limit(1);
    if (o) await markPaid(d, o.id, provider);
  }
  return NextResponse.json({ ok: true });
}
