import type { DB } from "@/db";
import { schema } from "@/db";

type Actor = { db: DB; org: { id: string }; user: { id: string; name: string } };

/** Record a settings change. Never pass secrets in `meta`. */
export async function audit(ctx: Actor, action: string, target?: string | null, meta: Record<string, unknown> = {}) {
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action, target: target ?? null, meta });
}

export const AUDIT_LABELS: Record<string, string> = {
  "team.invited": "Invited a teammate",
  "team.role_changed": "Changed a teammate's role",
  "team.removed": "Removed a teammate",
  "routing.created": "Added a routing rule",
  "routing.deleted": "Deleted a routing rule",
  "routing.toggled": "Turned a routing rule on or off",
  "api_key.created": "Created an API key",
  "api_key.revoked": "Revoked an API key",
  "webhook.created": "Added a webhook",
  "webhook.deleted": "Deleted a webhook",
  "payments.connected": "Connected a payment provider",
  "payments.removed": "Disconnected a payment provider",
  "store.connected": "Connected a store",
  "store.disconnected": "Disconnected a store",
  "sheets.connected": "Connected a Google Sheet",
  "sheets.disconnected": "Disconnected a Google Sheet",
  "segment.saved": "Saved a segment",
  "segment.deleted": "Deleted a segment",
  "number.connected": "Connected a WhatsApp number",
  "number.disconnected": "Disconnected a WhatsApp number",
  "whatsapp.embedded_signup": "Connected a number with Facebook",
  "data.exported": "Exported data",
  "automation.saved": "Changed an automation",
  "profile.updated": "Updated the WhatsApp profile",
  "plan.changed": "Changed plan",
  "plan.cancelled": "Cancelled the subscription",
  "plan.resumed": "Resumed the subscription",
};
