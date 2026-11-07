import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { kickJobs } from "@/lib/jobs";
import { toWaId } from "@/lib/phone";
import { handleInbound } from "@/lib/wa/inbound";

const Body = z.object({
  numberId: z.string().uuid(),
  from: z.string().min(5),
  name: z.string().max(80).optional(),
  text: z.string().min(1).max(4096),
  replyId: z.string().max(20).optional(),
});

/** The sandbox phone posts here as if it were a customer. */
export async function POST(req: Request) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { numberId, from, name, text, replyId } = parsed.data;
  const [number] = await ctx.db
    .select()
    .from(schema.waNumbers)
    .where(and(eq(schema.waNumbers.id, numberId), eq(schema.waNumbers.orgId, ctx.org.id), eq(schema.waNumbers.provider, "sandbox")))
    .limit(1);
  if (!number) return NextResponse.json({ error: "Not a sandbox number in this workspace" }, { status: 404 });
  const waId = toWaId(from);
  if (!waId) return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
  const r = await handleInbound(ctx.db, number, {
    waMessageId: `sbx-in.${randomToken(12)}`,
    from: waId,
    profileName: name || null,
    type: replyId ? "interactive" : "text",
    text,
    replyId: replyId ?? null,
    timestamp: new Date(),
  });
  kickJobs(ctx.db);
  return NextResponse.json(r);
}
