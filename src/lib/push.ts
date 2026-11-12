import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { enqueue, kickJobs } from "./jobs";

/** VAPID keys come from the environment; generate a pair once with `npx web-push generate-vapid-keys`. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@whatsflow.app", pub!, priv!);
  return configured;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Send to every device of these users. Expired subscriptions (404/410) are deleted. */
export async function sendPush(d: DB, userIds: string[], payload: PushPayload) {
  if (!userIds.length || !configure()) return;
  const subs = await d.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, userIds));
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await d.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
        else console.error("[push]", code, (e as Error).message);
      }
    }),
  );
}

/** Queue a notification so the webhook or action that caused it never waits on the push service. */
export async function queuePush(d: DB, kind: "inbound" | "assigned", data: { conversationId: string; byUserId?: string }) {
  if (!configure()) return;
  await enqueue(d, "push.notify", { kind, ...data });
  kickJobs(d);
}

/** Who hears about a conversation: its assignee, or everyone in the workspace while nobody owns it. Bot-handled chats stay quiet. */
export async function notifyConversation(d: DB, p: { kind: "inbound" | "assigned"; conversationId: string; byUserId?: string }) {
  const [row] = await d
    .select({ c: schema.conversations, name: schema.contacts.name, waId: schema.contacts.waId })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(eq(schema.conversations.id, p.conversationId))
    .limit(1);
  if (!row) return;
  const { c } = row;
  const who = row.name ?? `+${row.waId}`;
  const url = `/inbox?c=${c.id}`;
  if (p.kind === "assigned") {
    if (!c.assigneeId || c.assigneeId === p.byUserId) return;
    await sendPush(d, [c.assigneeId], { title: "Assigned to you", body: `${who}: ${c.lastMessagePreview ?? "New conversation"}`, url, tag: `conv-${c.id}` });
    return;
  }
  if (c.handledBy === "bot" || c.status === "closed") return;
  let users: string[];
  if (c.assigneeId) users = [c.assigneeId];
  else {
    const members = await d
      .select({ id: schema.memberships.userId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, c.orgId), p.byUserId ? ne(schema.memberships.userId, p.byUserId) : undefined));
    users = members.map((m) => m.id);
  }
  await sendPush(d, users, { title: who, body: c.lastMessagePreview ?? "New message", url, tag: `conv-${c.id}` });
}
