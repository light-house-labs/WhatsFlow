import { and, eq, inArray, isNull, sql, arrayOverlaps } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { registerJob, enqueue } from "./jobs";
import { applyStatus, sendInConversation } from "./wa/outbound";
import { sandboxReview } from "./wa/sandbox";
import { providerFor } from "./wa";
import { placeholderCount, resolveVariables } from "./template-render";
import { processPeriodEnds } from "./billing";
import { pruneRateLimits } from "./rate-limit";
import { checkAbandonedCart } from "./stores";
import { remindPayment } from "./orders";
import { decrypt } from "./crypto";
import { signWebhook } from "./webhooks-out";
import { assertPublicUrl } from "./net-guard";
import { bookingSettingsFor, slotLabel } from "./booking";
import { startAutomations } from "./events";
import { SendError } from "./wa/outbound";
import type { RunLogEntry } from "@/db/schema";

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

registerJob("order.payment_reminder", async (d, p) => {
  await remindPayment(d, p.orderId, Number(p.sentAt));
});

registerJob("store.cart_check", async (d, p) => {
  await checkAbandonedCart(d, p.cartId);
});

registerJob("ratelimits.prune", async (d) => {
  await pruneRateLimits(d);
});

const WEBHOOK_ATTEMPTS = 6;

// Outbound webhooks: signed POST, retried with backoff by the job runner on any non-2xx.
registerJob("webhook.deliver", async (d, p) => {
  const [row] = await d
    .select({ del: schema.webhookDeliveries, ep: schema.webhookEndpoints })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhookEndpoints, eq(schema.webhookEndpoints.id, schema.webhookDeliveries.endpointId))
    .where(eq(schema.webhookDeliveries.id, p.deliveryId))
    .limit(1);
  if (!row || row.del.status === "ok" || !row.ep.active) return;
  const attempts = row.del.attempts + 1;
  const body = JSON.stringify({ id: row.del.id, event: row.del.event, createdAt: row.del.createdAt.toISOString(), data: row.del.payload });
  const ts = Math.floor(Date.now() / 1000);
  let code: number | null = null;
  let error: string | null = null;
  try {
    await assertPublicUrl(row.ep.url);
    const res = await fetch(row.ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WhatsFlow-Webhooks/1",
        "X-WhatsFlow-Event": row.del.event,
        "X-WhatsFlow-Delivery": row.del.id,
        "X-WhatsFlow-Timestamp": String(ts),
        "X-WhatsFlow-Signature": signWebhook(decrypt(row.ep.secretEnc), ts, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    code = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = (e as Error).message;
  }
  const done = !error;
  await d
    .update(schema.webhookDeliveries)
    .set({
      attempts,
      responseCode: code,
      error,
      status: done ? "ok" : attempts >= WEBHOOK_ATTEMPTS ? "failed" : "pending",
      deliveredAt: done ? new Date() : null,
    })
    .where(eq(schema.webhookDeliveries.id, row.del.id));
  if (!done && attempts < WEBHOOK_ATTEMPTS) await enqueue(d, "webhook.deliver", { deliveryId: row.del.id }, 2 ** attempts * 10_000);
});

// Automations: run steps in order until a wait, a failed "if", or the end.
registerJob("automation.step", async (d, p) => {
  const [row] = await d
    .select({ run: schema.automationRuns, a: schema.automations })
    .from(schema.automationRuns)
    .innerJoin(schema.automations, eq(schema.automations.id, schema.automationRuns.automationId))
    .where(eq(schema.automationRuns.id, p.runId))
    .limit(1);
  if (!row || row.run.status === "done" || row.run.status === "stopped" || row.run.status === "failed") return;
  const { run, a } = row;
  const log: RunLogEntry[] = [...run.log];
  const note = (step: number, ok: boolean, detail: string) => log.push({ at: new Date().toISOString(), step, ok, detail });
  const [org] = await d.select({ status: schema.orgs.billingStatus }).from(schema.orgs).where(eq(schema.orgs.id, run.orgId));
  if (a.status !== "live" || org?.status === "cancelled") {
    note(run.step, false, "Stopped: automation paused or plan cancelled");
    await d.update(schema.automationRuns).set({ status: "stopped", log, updatedAt: new Date() }).where(eq(schema.automationRuns.id, run.id));
    return;
  }
  const [contact] = await d.select().from(schema.contacts).where(eq(schema.contacts.id, run.contactId));
  let convId = run.conversationId;
  if (!convId) {
    const [c] = await d.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, run.contactId)).limit(1);
    convId = c?.id ?? null;
  }
  let i = run.step;
  let status: "done" | "waiting" | "stopped" | "failed" = "done";
  for (; i < a.steps.length; i++) {
    const s = a.steps[i];
    try {
      if (s.type === "wait") {
        if (p.resumed !== i) {
          await enqueue(d, "automation.step", { runId: run.id, resumed: i }, Math.max(1, s.minutes) * 60_000);
          note(i, true, `Waiting ${s.minutes} min`);
          status = "waiting";
          break;
        }
        continue;
      }
      if (s.type === "if_tag") {
        const [fresh] = await d.select({ tags: schema.contacts.tags }).from(schema.contacts).where(eq(schema.contacts.id, run.contactId));
        if (!fresh?.tags.includes(s.tag)) {
          note(i, true, `Stopped: contact isn't tagged ${s.tag}`);
          status = "stopped";
          break;
        }
        note(i, true, `Tagged ${s.tag}: continue`);
        continue;
      }
      if (s.type === "add_tag") {
        await d
          .update(schema.contacts)
          .set({ tags: sql`array(select distinct unnest(${schema.contacts.tags} || array[${s.tag}]::text[]))` })
          .where(eq(schema.contacts.id, run.contactId));
        note(i, true, `Tagged ${s.tag}`);
        continue;
      }
      if (s.type === "assign") {
        if (convId) await d.update(schema.conversations).set({ assigneeId: s.userId, handledBy: "human" }).where(and(eq(schema.conversations.id, convId), eq(schema.conversations.orgId, run.orgId)));
        note(i, true, "Assigned conversation");
        continue;
      }
      // a template can open a chat with someone who came from a store; free text can't
      if (!convId && s.type === "send_template" && contact) convId = await openConversation(d, run.orgId, contact.id);
      if (!convId) throw new SendError("No WhatsApp conversation with this contact yet");
      // {name} in free text is the full name, as before; templates get the first name
      const vars: Record<string, string> = { name: contact?.name || "there", ...run.vars };
      if (s.type === "send_text") {
        const body = s.text.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
        const m = await sendInConversation(d, convId, { kind: "text", body }, { senderKind: "system" });
        if (m.status === "failed") throw new SendError(m.error ?? "Send failed");
        note(i, true, "Sent message");
      } else if (s.type === "send_template") {
        const [tpl] = await d.select().from(schema.templates).where(and(eq(schema.templates.id, s.templateId), eq(schema.templates.orgId, run.orgId), eq(schema.templates.status, "approved")));
        if (!tpl) throw new SendError("Template missing or not approved");
        const names = s.variables?.length ? s.variables : ["name"];
        const tplVars: Record<string, string> = { ...vars, name: contact?.name?.split(" ")[0] || "there" };
        const variables = Array.from({ length: placeholderCount(tpl.body) }, (_, j) => tplVars[names[j] ?? ""] ?? "");
        if (variables.some((v) => !v)) throw new SendError(`Template needs ${placeholderCount(tpl.body)} values; set them on this step (available: ${Object.keys(tplVars).join(", ")})`);
        const m = await sendInConversation(d, convId, { kind: "template", template: tpl, variables }, { senderKind: "system", templateId: tpl.id });
        if (m.status === "failed") throw new SendError(m.error ?? "Send failed");
        note(i, true, `Sent template ${tpl.name}`);
      }
    } catch (e) {
      if (!(e instanceof SendError)) throw e;
      note(i, false, e.message);
      status = "failed";
      break;
    }
  }
  await d
    .update(schema.automationRuns)
    .set({ step: status === "waiting" ? i : i, status: status === "waiting" ? "waiting" : status, log, conversationId: convId, updatedAt: new Date() })
    .where(eq(schema.automationRuns.id, run.id));
});

/** Find or start a chat with a contact on the workspace's best number: a connected Cloud API number, else the sandbox. */
async function openConversation(d: DB, orgId: string, contactId: string) {
  const [existing] = await d.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, contactId)).limit(1);
  if (existing) return existing.id;
  const numbers = await d.select().from(schema.waNumbers).where(and(eq(schema.waNumbers.orgId, orgId), inArray(schema.waNumbers.status, ["connected", "pending"])));
  const number = numbers.find((n) => n.provider === "cloud") ?? numbers.find((n) => n.provider === "sandbox");
  if (!number) return null;
  const [conv] = await d
    .insert(schema.conversations)
    .values({ orgId, contactId, numberId: number.id, handledBy: "human", status: "open" })
    .onConflictDoNothing()
    .returning({ id: schema.conversations.id });
  return conv?.id ?? null;
}

// "No reply" automations: our last message went unanswered for N minutes.
registerJob("automation.no_reply", async (d) => {
  const live = await d.select().from(schema.automations).where(and(eq(schema.automations.trigger, "no_reply"), eq(schema.automations.status, "live")));
  for (const a of live) {
    const minutes = Number(a.triggerConfig.minutes ?? 120);
    const rows = await d.execute<{ id: string; contact_id: string; last_message_at: string }>(sql`
      select c.id, c.contact_id, c.last_message_at from conversations c
      where c.org_id = ${a.orgId} and c.status <> 'closed'
        and c.last_message_at < now() - (${minutes} || ' minutes')::interval
        and c.last_message_at > now() - interval '7 days'
        and (select m.direction from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) = 'out'
      limit 200`);
    const list = (rows as unknown as { rows?: { id: string; contact_id: string; last_message_at: string }[] }).rows ?? (rows as unknown as { id: string; contact_id: string; last_message_at: string }[]);
    for (const r of list) {
      await startAutomations(d, a.orgId, "no_reply", { contactId: r.contact_id, conversationId: r.id, key: `noreply:${r.id}:${new Date(r.last_message_at).getTime()}` });
    }
  }
});

// Appointment reminders: free text inside the 24-hour window, the chosen template outside it.
registerJob("appointment.reminder", async (d, p) => {
  const [row] = await d
    .select({ a: schema.appointments, svc: schema.services, contact: schema.contacts, org: schema.orgs })
    .from(schema.appointments)
    .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.appointments.contactId))
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.appointments.orgId))
    .where(eq(schema.appointments.id, p.appointmentId))
    .limit(1);
  if (!row || row.a.status !== "booked" || row.a.reminderSentAt || row.a.startAt < new Date()) return;
  let convId = row.a.conversationId;
  if (!convId) {
    const [c] = await d.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, row.contact.id)).limit(1);
    convId = c?.id ?? null;
  }
  if (!convId) return;
  const when = slotLabel(row.a.startAt, row.org.timezone);
  const s = await bookingSettingsFor(d, row.org.id);
  try {
    await sendInConversation(d, convId, { kind: "text", body: `Reminder: your ${row.svc.name} at ${row.org.name} is on ${when}. Reply CANCEL to cancel or RESCHEDULE to pick another time.` }, { senderKind: "system" });
  } catch (e) {
    if (!(e instanceof SendError)) throw e;
    const [tpl] = s.reminderTemplateId
      ? await d.select().from(schema.templates).where(and(eq(schema.templates.id, s.reminderTemplateId), eq(schema.templates.status, "approved")))
      : [];
    if (!tpl) {
      await d.insert(schema.notes).values({ orgId: row.org.id, conversationId: convId, body: `Couldn't send the reminder for ${row.svc.name} on ${when}: the 24-hour window is closed and no reminder template is set in Appointments → Settings.` });
      return;
    }
    await sendInConversation(d, convId, { kind: "template", template: tpl, variables: [row.contact.name ?? "there", row.svc.name, when].slice(0, placeholderCount(tpl.body)) }, { senderKind: "system", templateId: tpl.id });
  }
  await d.update(schema.appointments).set({ reminderSentAt: new Date() }).where(eq(schema.appointments.id, row.a.id));
});

export {};
