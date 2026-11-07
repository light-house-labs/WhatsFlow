import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";

type Contact = typeof schema.contacts.$inferSelect;
type Message = typeof schema.messages.$inferSelect;
type Conversation = typeof schema.conversations.$inferSelect;

export const contactJson = (c: Contact) => ({
  id: c.id,
  phone: c.waId,
  name: c.name,
  email: c.email,
  tags: c.tags,
  customFields: c.customFields,
  optedOut: Boolean(c.optedOutAt),
  source: c.source,
  lastMessageAt: c.lastInboundAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
});

export const messageJson = (m: Message) => ({
  id: m.id,
  conversationId: m.conversationId,
  direction: m.direction,
  type: m.type,
  text: m.body,
  status: m.status,
  error: m.error,
  sender: m.senderKind,
  createdAt: m.createdAt.toISOString(),
});

export const conversationJson = (c: Conversation) => ({
  id: c.id,
  contactId: c.contactId,
  status: c.status,
  handledBy: c.handledBy,
  assigneeId: c.assigneeId,
  labels: c.labels,
  unread: c.unreadCount,
  lastMessageAt: c.lastMessageAt.toISOString(),
  windowOpen: Boolean(c.lastInboundAt && Date.now() - c.lastInboundAt.getTime() < 24 * 3600_000),
});

/** Cursor pagination on created_at: pass back `next` as ?before= */
export function pageParams(url: URL) {
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
  const before = url.searchParams.get("before");
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
  return { limit, before: beforeDate };
}

/** The conversation with this contact on the workspace's number (the first connected one, or the given one). */
export async function conversationFor(d: DB, orgId: string, contactId: string, numberId?: string | null) {
  const numbers = await d.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, orgId));
  const number = numberId ? numbers.find((n) => n.id === numberId) : (numbers.find((n) => n.provider === "cloud" && n.status === "connected") ?? numbers[0]);
  if (!number) return null;
  const [existing] = await d
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.contactId, contactId), eq(schema.conversations.numberId, number.id)))
    .limit(1);
  if (existing) return existing;
  const [created] = await d
    .insert(schema.conversations)
    .values({ orgId, contactId, numberId: number.id, status: "closed", handledBy: "human" })
    .returning();
  return created;
}
