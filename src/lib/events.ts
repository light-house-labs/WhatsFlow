import { and, arrayContains, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { AutomationTrigger, WebhookEvent } from "@/db/schema";
import { enqueue, kickJobs } from "./jobs";

type Subject = { contactId: string; conversationId?: string | null; key: string };

/**
 * Something happened in a workspace. Queues outbound webhook deliveries and
 * starts matching live automations. Never throws into the caller's flow.
 */
export async function emit(
  d: DB,
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  subject?: Subject,
) {
  try {
    const endpoints = await d
      .select({ id: schema.webhookEndpoints.id })
      .from(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.orgId, orgId),
          eq(schema.webhookEndpoints.active, true),
          arrayContains(schema.webhookEndpoints.events, [event]),
        ),
      );
    for (const ep of endpoints) {
      const [delivery] = await d
        .insert(schema.webhookDeliveries)
        .values({ endpointId: ep.id, orgId, event, payload: data })
        .returning({ id: schema.webhookDeliveries.id });
      await enqueue(d, "webhook.deliver", { deliveryId: delivery.id });
    }
    const trigger = TRIGGERS[event];
    if (trigger && subject) await startAutomations(d, orgId, trigger, subject);
    if (endpoints.length || (trigger && subject)) kickJobs(d);
  } catch (e) {
    console.error("[events]", event, e);
  }
}

const TRIGGERS: Partial<Record<WebhookEvent, AutomationTrigger>> = {
  "conversation.started": "conversation_started",
  "order.created": "order_created",
  "order.paid": "order_paid",
  "appointment.booked": "appointment_booked",
};

/** Start a run of every live automation on this trigger. Each subject runs at most once per automation. */
export async function startAutomations(d: DB, orgId: string, trigger: AutomationTrigger, subject: Subject) {
  const live = await d
    .select()
    .from(schema.automations)
    .where(and(eq(schema.automations.orgId, orgId), eq(schema.automations.trigger, trigger), eq(schema.automations.status, "live")));
  for (const a of live) {
    const [run] = await d
      .insert(schema.automationRuns)
      .values({
        automationId: a.id,
        orgId,
        contactId: subject.contactId,
        conversationId: subject.conversationId ?? null,
        triggerKey: subject.key,
      })
      .onConflictDoNothing()
      .returning({ id: schema.automationRuns.id });
    if (run) await enqueue(d, "automation.step", { runId: run.id });
  }
}
