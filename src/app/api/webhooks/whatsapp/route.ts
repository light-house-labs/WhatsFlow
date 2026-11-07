import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handleInbound, parseCloudWebhook } from "@/lib/wa/inbound";
import { applyStatus } from "@/lib/wa/outbound";
import { kickJobs } from "@/lib/jobs";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// Meta's verification handshake when the callback URL is saved.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") !== "subscribe") return new NextResponse("bad request", { status: 400 });
  const token = p.get("hub.verify_token") ?? "";
  const d = await db();
  const [n] = await d.select({ id: schema.waNumbers.id }).from(schema.waNumbers).where(eq(schema.waNumbers.verifyToken, token)).limit(1);
  if (!n) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

function signatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const d = await db();
  // keep a raw copy; the unique key makes Meta's retries no-ops
  const inserted = await d
    .insert(schema.webhookEvents)
    .values({ provider: "meta", externalId: sha256(raw), payload: body })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (!inserted.length) return NextResponse.json({ ok: true, duplicate: true });

  for (const change of parseCloudWebhook(body)) {
    const [number] = await d.select().from(schema.waNumbers).where(eq(schema.waNumbers.phoneNumberId, change.phoneNumberId)).limit(1);
    if (!number) continue;
    await d.update(schema.waNumbers).set({ lastWebhookAt: new Date(), status: "connected" }).where(eq(schema.waNumbers.id, number.id));
    for (const m of change.messages) {
      try {
        await handleInbound(d, number, m);
      } catch (e) {
        console.error("[webhook] inbound failed", m.waMessageId, e);
      }
    }
    for (const s of change.statuses) await applyStatus(d, s.id, s.status, s.error);
  }
  kickJobs(d);
  return NextResponse.json({ ok: true });
}
