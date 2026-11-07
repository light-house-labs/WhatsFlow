import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { customerSays, drainJobs, makeOrg } from "./helpers";
import { sendInConversation, SendError } from "@/lib/wa/outbound";
import { handleInbound } from "@/lib/wa/inbound";
import { enqueue } from "@/lib/jobs";

async function thread(d: Awaited<ReturnType<typeof makeOrg>>["d"], conversationId: string) {
  return d.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt));
}

describe("inbound pipeline", () => {
  it("creates contact, conversation, enquiry and sends the welcome message", async () => {
    const { d, org, number } = await makeOrg();
    // force business hours open all week so the test is time-independent
    const all = { open: "00:00", close: "23:59" };
    await d.update(schema.inboxSettings).set({ businessHours: { mon: all, tue: all, wed: all, thu: all, fri: all, sat: all, sun: all } }).where(eq(schema.inboxSettings.orgId, org.id));
    const r = await customerSays(number, "919800000001", "Do you have parking?");
    expect(r.duplicate).toBe(false);
    const [contact] = await d.select().from(schema.contacts).where(eq(schema.contacts.orgId, org.id));
    expect(contact.name).toBe("Asha Kumar");
    const msgs = await thread(d, r.conversationId!);
    expect(msgs.map((m) => m.direction)).toEqual(["in", "out"]);
    expect(msgs[1].body).toMatch(/Thanks for messaging/);
    const enq = await d.select().from(schema.enquiries).where(eq(schema.enquiries.orgId, org.id));
    expect(enq).toHaveLength(1);
    expect(enq[0].status).toBe("needs_human");
  });

  it("is idempotent on retried webhooks", async () => {
    const { d, number, org } = await makeOrg();
    const m = { waMessageId: "dup.1." + Date.now(), from: "919800000002", type: "text", text: "hello?", timestamp: new Date() };
    await handleInbound(d, number, m);
    const again = await handleInbound(d, number, m);
    expect(again.duplicate).toBe(true);
    const inbound = await d.select().from(schema.messages).where(and(eq(schema.messages.orgId, org.id), eq(schema.messages.direction, "in")));
    expect(inbound).toHaveLength(1);
  });

  it("runs a live bot flow end to end and creates a lead", async () => {
    const { d, org, number } = await makeOrg();
    await d.update(schema.botFlows).set({ status: "live" }).where(eq(schema.botFlows.orgId, org.id));
    const r1 = await customerSays(number, "919800000003", "hi");
    let msgs = await thread(d, r1.conversationId!);
    expect(msgs.at(-1)?.type).toBe("buttons");
    await customerSays(number, "919800000003", "Book a visit", "btn:1");
    msgs = await thread(d, r1.conversationId!);
    expect(msgs.at(-1)?.body).toMatch(/What day suits you/);
    await customerSays(number, "919800000003", "Monday morning");
    const leads = await d.select().from(schema.leads).where(eq(schema.leads.orgId, org.id));
    expect(leads).toHaveLength(1);
    expect(leads[0].notes).toContain("preferred_day: Monday morning");
    const [enq] = await d.select().from(schema.enquiries).where(eq(schema.enquiries.orgId, org.id));
    expect(enq.status).toBe("converted");
  });

  it("hands over to a person when the reply isn't an option", async () => {
    const { d, org, number } = await makeOrg();
    await d.update(schema.botFlows).set({ status: "live" }).where(eq(schema.botFlows.orgId, org.id));
    const r = await customerSays(number, "919800000004", "hello");
    await customerSays(number, "919800000004", "can I speak to the doctor");
    const [conv] = await d.select().from(schema.conversations).where(eq(schema.conversations.id, r.conversationId!));
    expect(conv.handledBy).toBe("human");
    expect(conv.waitingSince).not.toBeNull();
  });

  it("honours opt-out and blocks marketing templates afterwards", async () => {
    const { d, org, number } = await makeOrg();
    const r = await customerSays(number, "919800000005", "STOP");
    const [contact] = await d.select().from(schema.contacts).where(eq(schema.contacts.orgId, org.id));
    expect(contact.optedOutAt).not.toBeNull();
    await expect(
      sendInConversation(
        d,
        r.conversationId!,
        { kind: "template", template: { name: "promo", language: "en", headerText: null, body: "Sale!", footer: null, buttons: [], category: "MARKETING" }, variables: [] },
        { senderKind: "user" },
      ),
    ).rejects.toBeInstanceOf(SendError);
  });

  it("refuses free-form replies outside the 24-hour window", async () => {
    const { d, number } = await makeOrg();
    const r = await customerSays(number, "919800000006", "hi");
    await d.update(schema.conversations).set({ lastInboundAt: new Date(Date.now() - 30 * 3600_000) }).where(eq(schema.conversations.id, r.conversationId!));
    await expect(sendInConversation(d, r.conversationId!, { kind: "text", body: "hello" }, { senderKind: "user" })).rejects.toThrow(/24-hour/);
  });

  it("advances sandbox delivery statuses forward only", async () => {
    const { d, number } = await makeOrg();
    const r = await customerSays(number, "919800000007", "hi");
    const sent = await sendInConversation(d, r.conversationId!, { kind: "text", body: "Hello Asha" }, { senderKind: "user" });
    await drainJobs();
    const [m] = await d.select().from(schema.messages).where(eq(schema.messages.id, sent.id));
    expect(m.status).toBe("read");
    // a late "delivered" must not move it backwards
    await enqueue(d, "sandbox.status", { waMessageId: m.waMessageId, status: "sent" });
    await drainJobs();
    const [m2] = await d.select().from(schema.messages).where(eq(schema.messages.id, sent.id));
    expect(m2.status).toBe("read");
  });

  it("keeps workspaces apart", async () => {
    const a = await makeOrg("A");
    const b = await makeOrg("B");
    await customerSays(a.number, "919800000008", "only for A");
    const bContacts = await b.d.select().from(schema.contacts).where(eq(schema.contacts.orgId, b.org.id));
    expect(bContacts).toHaveLength(0);
  });
});

describe("campaigns", () => {
  it("sends an approved template to a tag, skips opted-out contacts, and attributes replies", async () => {
    const { d, org, number } = await makeOrg();
    const [tpl] = await d
      .insert(schema.templates)
      .values({ orgId: org.id, name: "diwali_offer", category: "MARKETING", body: "Hi {{1}}, our festive offer is on this week.", status: "approved" })
      .returning();
    await d.insert(schema.contacts).values([
      { orgId: org.id, waId: "919811111111", name: "Ravi", tags: ["vip"] },
      { orgId: org.id, waId: "919822222222", name: "Meera", tags: ["vip"], optedOutAt: new Date() },
      { orgId: org.id, waId: "919833333333", name: "Out of segment", tags: [] },
    ]);
    const [c] = await d
      .insert(schema.campaigns)
      .values({ orgId: org.id, name: "Festive", templateId: tpl.id, numberId: number.id, audience: { tags: ["vip"] }, variableMap: { "1": "name" }, status: "scheduled" })
      .returning();
    await enqueue(d, "campaign.send", { campaignId: c.id });
    await drainJobs();
    const rec = await d.select().from(schema.campaignRecipients).where(eq(schema.campaignRecipients.campaignId, c.id));
    expect(rec.map((r) => r.status).sort()).toEqual(["read", "skipped"]);
    const [camp] = await d.select().from(schema.campaigns).where(eq(schema.campaigns.id, c.id));
    expect(camp.status).toBe("sent");
    const out = await d.select().from(schema.messages).where(and(eq(schema.messages.orgId, org.id), eq(schema.messages.campaignId, c.id)));
    expect(out[0].body).toBe("Hi Ravi, our festive offer is on this week.");
    await customerSays(number, "919811111111", "Interested!");
    const [ravi] = await d.select().from(schema.campaignRecipients).where(and(eq(schema.campaignRecipients.campaignId, c.id), eq(schema.campaignRecipients.status, "replied")));
    expect(ravi).toBeTruthy();
  });
});
