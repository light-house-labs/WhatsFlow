import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";
import { providerFor } from "@/lib/wa";

export const dynamic = "force-dynamic";

/** Streams an inbound photo or file to a signed-in member, fetched from Meta with the number's token. */
export async function GET(_: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const ctx = await orgOrNull();
  if (!ctx) return new Response("unauthorised", { status: 401 });
  const { messageId } = await params;
  const [row] = await ctx.db
    .select({ m: schema.messages, n: schema.waNumbers })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .innerJoin(schema.waNumbers, eq(schema.waNumbers.id, schema.conversations.numberId))
    .where(and(eq(schema.messages.id, messageId), eq(schema.messages.orgId, ctx.org.id)))
    .limit(1);
  const media = row?.m.payload?.media as { id?: string } | undefined;
  if (!row || !media?.id) return new Response("not found", { status: 404 });
  const file = await providerFor(row.n).fetchMedia(media.id);
  if (!file) return new Response("media no longer available from WhatsApp", { status: 404 });
  return new Response(file.body, { headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=3600" } });
}
