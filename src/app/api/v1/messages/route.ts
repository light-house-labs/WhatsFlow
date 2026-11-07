import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { apiAuth, apiError } from "@/lib/api-auth";
import { conversationFor, messageJson } from "@/lib/api-v1";
import { toWaId } from "@/lib/phone";
import { sendInConversation, SendError } from "@/lib/wa/outbound";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    to: z.string().min(6).max(20),
    numberId: z.string().uuid().optional(),
    text: z.string().min(1).max(4096).optional(),
    template: z.object({ name: z.string().min(1), language: z.string().default("en"), variables: z.array(z.string().max(1024)).max(20).default([]) }).optional(),
  })
  .refine((b) => Boolean(b.text) !== Boolean(b.template), { message: "Send either text or template, not both." });

/**
 * Send a WhatsApp message. Free text needs the customer to have messaged in the
 * last 24 hours; otherwise send an approved template.
 */
export async function POST(req: Request) {
  const auth = await apiAuth(req, "full");
  if ("error" in auth) return auth.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid body");
  const v = parsed.data;
  const waId = toWaId(v.to);
  if (!waId) return apiError(400, "invalid_phone", "Use an international number, e.g. +919876543210.");
  const [contact] = await auth.d
    .insert(schema.contacts)
    .values({ orgId: auth.orgId, waId, source: "api" })
    .onConflictDoUpdate({ target: [schema.contacts.orgId, schema.contacts.waId], set: { updatedAt: new Date() } })
    .returning();
  const conv = await conversationFor(auth.d, auth.orgId, contact.id, v.numberId);
  if (!conv) return apiError(409, "no_number", "Connect a WhatsApp number first.");
  try {
    let msg;
    if (v.template) {
      const [tpl] = await auth.d
        .select()
        .from(schema.templates)
        .where(and(eq(schema.templates.orgId, auth.orgId), eq(schema.templates.name, v.template.name), eq(schema.templates.language, v.template.language), eq(schema.templates.status, "approved")));
      if (!tpl) return apiError(404, "template_not_found", "No approved template with that name and language.");
      msg = await sendInConversation(auth.d, conv.id, { kind: "template", template: tpl, variables: v.template.variables }, { senderKind: "system", templateId: tpl.id });
    } else {
      msg = await sendInConversation(auth.d, conv.id, { kind: "text", body: v.text! }, { senderKind: "system" });
    }
    return NextResponse.json({ data: messageJson(msg) }, { status: msg.status === "failed" ? 502 : 201 });
  } catch (e) {
    if (e instanceof SendError) return apiError(422, "cannot_send", e.message);
    throw e;
  }
}
