import { and, eq, inArray, isNull, sql, arrayOverlaps } from "drizzle-orm";
import { schema } from "@/db";
import { registerJob, enqueue } from "./jobs";
import { applyStatus, sendInConversation } from "./wa/outbound";
import { sandboxReview } from "./wa/sandbox";
import { providerFor } from "./wa";
import { placeholderCount, resolveVariables } from "./template-render";
import { processPeriodEnds } from "./billing";

// Sandbox: delivered, then read a moment later.
registerJob("sandbox.status", async (d, p) => {
  await applyStatus(d, p.waMessageId, p.status);
  if (p.status === "delivered") await enqueue(d, "sandbox.status", { waMessageId: p.waMessageId, status: "read" }, 2500);
});

registerJob("sandbox.template_review", async (d, p) => {
  const [t] = await d.select().from(schema.templates).where(eq(schema.templates.id, p.templateId)).limit(1);
  if (!t || t.status !== "pending") return;
  const r = sandboxReview(t.body, placeholderCount(t.body));
  await d
    .update(schema.templates)
    .set({ status: r.approved ? "approved" : "rejected", rejectionReason: r.reason ?? null, updatedAt: new Date() })
    .where(eq(schema.templates.id, t.id));
});

// Cloud: poll Meta for a submitted template's review result.
registerJob("template.sync", async (d, p) => {
  const [row] = await d
    .select({ t: schema.templates, n: schema.waNumbers })
    .from(schema.templates)
    .innerJoin(schema.waNumbers, eq(schema.waNumbers.orgId, schema.templates.orgId))
    .where(and(eq(schema.templates.id, p.templateId), eq(schema.waNumbers.provider, "cloud")))
    .limit(1);
  if (!row || row.t.status !== "pending" || !row.t.metaTemplateId) return;
  const s = await providerFor(row.n).templateStatus(row.t.metaTemplateId);
  if (!s || s.status === "pending") {
    if ((p.tries ?? 0) < 60) await enqueue(d, "template.sync", { templateId: row.t.id, tries: (p.tries ?? 0) + 1 }, 60_000);
    return;
  }
  await d
    .update(schema.templates)
    .set({ status: s.status, rejectionReason: s.reason ?? null, updatedAt: new Date() })
    .where(eq(schema.templates.id, row.t.id));
});

const BATCH = 50;

/** Meta's limit on new business-initiated conversations per 24h, e.g. TIER_1K → 1000. */
export function tierLimit(tier: string | null): number {
  if (!tier || tier === "TIER_UNLIMITED") return tier ? Infinity : 250;
  const m = tier.match(/^TIER_(\d+)(K)?$/);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : 250;
}

// Campaign: resolve audience once, then send in batches so one bad number never stops the rest.
registerJob("campaign.send", async (d, p) => {
  const [c] = await d.select().from(schema.campaigns).where(eq(schema.campaigns.id, p.campaignId)).limit(1);
  if (!c || c.status === "cancelled" || c.status === "sent") return;
  const [org] = await d.select({ status: schema.orgs.billingStatus }).from(schema.orgs).where(eq(schema.orgs.id, c.orgId)).limit(1);
  if (org?.status === "cancelled") {
    await d.update(schema.campaigns).set({ status: "cancelled" }).where(eq(schema.campaigns.id, c.id));
    return;
  }
  const [tpl] = await d.select().from(schema.templates).where(eq(schema.templates.id, c.templateId)).limit(1);
  if (!tpl || tpl.status !== "approved") throw new Error("Template is not approved");

  if (c.status !== "sending") {
    const where = [eq(schema.contacts.orgId, c.orgId)];
    if (c.audience.tags?.length) where.push(arrayOverlaps(schema.contacts.tags, c.audience.tags));
    if (c.audience.contactIds?.length) where.push(inArray(schema.contacts.id, c.audience.contactIds));
    const audience = await d.select({ id: schema.contacts.id, optedOutAt: schema.contacts.optedOutAt }).from(schema.contacts).where(and(...where));
    if (audience.length) {
      await d
        .insert(schema.campaignRecipients)
        .values(
          audience.map((a) => ({
            campaignId: c.id,
            contactId: a.id,
            status: tpl.category === "MARKETING" && a.optedOutAt ? ("skipped" as const) : ("pending" as const),
            error: tpl.category === "MARKETING" && a.optedOutAt ? "Opted out" : null,
          })),
        )
        .onConflictDoNothing();
    }
    await d.update(schema.campaigns).set({ status: "sending", sentAt: new Date() }).where(eq(schema.campaigns.id, c.id));
  }

  // Stay inside the number's daily messaging limit: count distinct people sent a
  // template from this number in the last 24 hours, and wait an hour when full.
  const [number] = await d.select().from(schema.waNumbers).where(eq(schema.waNumbers.id, c.numberId)).limit(1);
  const [used] = await d
    .select({ n: sql<number>`count(distinct ${schema.conversations.contactId})` })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.conversations.numberId, c.numberId), eq(schema.messages.type, "template"), sql`${schema.messages.createdAt} > now() - interval '24 hours'`, sql`${schema.messages.status} <> 'failed'`));
  const room = tierLimit(number?.messagingTier ?? null) - Number(used?.n ?? 0);
  if (room <= 0) {
    await enqueue(d, "campaign.send", { campaignId: c.id }, 3600_000);
    return;
  }

  const pending = await d
    .select({ r: schema.campaignRecipients, contact: schema.contacts })
    .from(schema.campaignRecipients)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.campaignRecipients.contactId))
    .where(and(eq(schema.campaignRecipients.campaignId, c.id), eq(schema.campaignRecipients.status, "pending")))
    .limit(Math.min(BATCH, room));

  const count = placeholderCount(tpl.body);
  for (const { r, contact } of pending) {
    try {
      // find or create the conversation on the campaign's number
      let [conv] = await d
        .select()
        .from(schema.conversations)
        .where(and(eq(schema.conversations.contactId, contact.id), eq(schema.conversations.numberId, c.numberId)))
        .limit(1);
      if (!conv) {
        [conv] = await d
          .insert(schema.conversations)
          .values({ orgId: c.orgId, contactId: contact.id, numberId: c.numberId, status: "closed", handledBy: "bot" })
          .returning();
      }
      const msg = await sendInConversation(
        d,
        conv.id,
        { kind: "template", template: tpl, variables: resolveVariables(c.variableMap, count, contact) },
        { senderKind: "campaign", templateId: tpl.id, campaignId: c.id },
      );
      await d
        .update(schema.campaignRecipients)
        .set({ messageId: msg.id, status: msg.status === "failed" ? "failed" : "sent", error: msg.error })
        .where(eq(schema.campaignRecipients.id, r.id));
    } catch (e) {
      await d
        .update(schema.campaignRecipients)
        .set({ status: "failed", error: (e as Error).message })
        .where(eq(schema.campaignRecipients.id, r.id));
    }
  }

  const [left] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.campaignRecipients)
    .where(and(eq(schema.campaignRecipients.campaignId, c.id), eq(schema.campaignRecipients.status, "pending")));
  if (Number(left?.n ?? 0) > 0) await enqueue(d, "campaign.send", { campaignId: c.id }, 1000);
  else await d.update(schema.campaigns).set({ status: "sent" }).where(eq(schema.campaigns.id, c.id));
});

// Pipeline follow-up reminders: leave a note on the conversation for the owner.
registerJob("lead.followups", async (d) => {
  const due = await d
    .select()
    .from(schema.leads)
    .where(and(sql`${schema.leads.nextFollowUpAt} <= now()`, isNull(schema.leads.closedAt)))
    .limit(100);
  for (const l of due) {
    if (l.conversationId) {
      await d.insert(schema.notes).values({
        orgId: l.orgId,
        conversationId: l.conversationId,
        authorId: null,
        body: `Reminder: follow up on “${l.title}”.`,
      });
    }
    await d.update(schema.leads).set({ nextFollowUpAt: null }).where(eq(schema.leads.id, l.id));
  }
});

registerJob("billing.period_end", async (d) => {
  await processPeriodEnds(d);
});

export {};
