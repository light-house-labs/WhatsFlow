import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Sub = z.object({
  endpoint: z.string().url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Save this device's push subscription for the signed-in user. */
export async function POST(req: NextRequest) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await ctx.db
    .insert(schema.pushSubscriptions)
    .values({ userId: ctx.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: ctx.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent } });
  return NextResponse.json({ ok: true });
}

/** Turn notifications off for this device. */
export async function DELETE(req: NextRequest) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await ctx.db
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, ctx.user.id)));
  return NextResponse.json({ ok: true });
}
