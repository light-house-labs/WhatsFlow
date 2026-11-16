import { describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { schema } from "@/db";
import { makeOrg } from "./helpers";
import { enqueue, enqueuePeriodic, registerJob, runDueJobs } from "@/lib/jobs";
import { POST as whatsappWebhook } from "@/app/api/webhooks/whatsapp/route";

const webhook = (phoneNumberId: string, msg: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    body: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, messages: [msg] } }] }] }),
  });

describe("WhatsApp webhook", () => {
  it("asks Meta to retry when a message can't be stored, and ignores true repeats", async () => {
    const o = await makeOrg();
    const pn = `PN${Date.now()}`;
    await o.d.update(schema.waNumbers).set({ phoneNumberId: pn }).where(eq(schema.waNumbers.id, o.number.id));

    // no sender: storing the contact fails
    const bad = { id: `wamid.bad.${Date.now()}`, type: "text", text: { body: "hi" }, timestamp: String(Math.floor(Date.now() / 1000)) };
    expect((await whatsappWebhook(webhook(pn, bad))).status).toBe(500);
    // the event was forgotten, so the retry is processed again rather than skipped as a duplicate
    expect((await whatsappWebhook(webhook(pn, bad))).status).toBe(500);

    const good = { ...bad, id: `wamid.ok.${Date.now()}`, from: "919000000777" };
    const first = await whatsappWebhook(webhook(pn, good));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(await (await whatsappWebhook(webhook(pn, good))).json()).toEqual({ ok: true, duplicate: true });
    const stored = await o.d.select().from(schema.messages).where(eq(schema.messages.waMessageId, String(good.id)));
    expect(stored).toHaveLength(1);
  });

  it("accepts a message delivered a day late, when we can no longer reply", async () => {
    const o = await makeOrg();
    const pn = `PN${Date.now()}c`;
    await o.d.update(schema.waNumbers).set({ phoneNumberId: pn }).where(eq(schema.waNumbers.id, o.number.id));
    const id = `wamid.late.${Date.now()}`;
    const res = await whatsappWebhook(webhook(pn, { id, from: "919000000779", type: "text", text: { body: "hi" }, timestamp: "1700000000" }));
    expect(res.status).toBe(200);
    expect(await o.d.select().from(schema.messages).where(eq(schema.messages.waMessageId, id))).toHaveLength(1);
  });

  it("uses the arrival time when Meta sends no timestamp", async () => {
    const o = await makeOrg();
    const pn = `PN${Date.now()}b`;
    await o.d.update(schema.waNumbers).set({ phoneNumberId: pn }).where(eq(schema.waNumbers.id, o.number.id));
    const id = `wamid.nots.${Date.now()}`;
    expect((await whatsappWebhook(webhook(pn, { id, from: "919000000778", type: "text", text: { body: "hello" } }))).status).toBe(200);
    const [m] = await o.d.select().from(schema.messages).where(eq(schema.messages.waMessageId, id));
    expect(Date.now() - m.createdAt.getTime()).toBeLessThan(60_000);
  });
});

describe("job runner", () => {
  it("queues one of each periodic job, however often it is asked", async () => {
    const { d } = await makeOrg();
    await d.update(schema.jobs).set({ doneAt: new Date() }).where(isNull(schema.jobs.doneAt));
    await enqueuePeriodic(d);
    await enqueuePeriodic(d);
    const kinds = ["lead.followups", "billing.period_end", "automation.no_reply", "ratelimits.prune", "sheets.sync"];
    const waiting = await d.select().from(schema.jobs).where(and(isNull(schema.jobs.doneAt), inArray(schema.jobs.kind, kinds)));
    expect(waiting.map((j) => j.kind).sort()).toEqual([...kinds].sort());
  });

  it("gives up on a job whose runs keep dying instead of retrying forever", async () => {
    const { d } = await makeOrg();
    await d.update(schema.jobs).set({ doneAt: new Date() }).where(isNull(schema.jobs.doneAt));
    let ran = 0;
    registerJob("test.dies", async () => {
      ran++;
    });
    await enqueue(d, "test.dies", {});
    // five earlier runs took the lock and never came back
    await d.update(schema.jobs).set({ attempts: 5, lockedUntil: new Date(0) }).where(eq(schema.jobs.kind, "test.dies"));
    await runDueJobs(d);
    const [job] = await d.select().from(schema.jobs).where(eq(schema.jobs.kind, "test.dies"));
    expect(ran).toBe(0);
    expect(job.doneAt).not.toBeNull();
    expect(job.error).toMatch(/never finished/);
  });
});
