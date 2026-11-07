import { randomToken } from "@/lib/crypto";
import type { HealthCheck, WhatsAppProvider } from "./types";

/**
 * Local stand-in for the Cloud API. Messages are "delivered" to the sandbox phone
 * at /sandbox; statuses advance through jobs; templates are reviewed by a simple
 * rule set after a short delay so the approval lifecycle is visible.
 */
export function sandboxProvider(): WhatsAppProvider {
  return {
    async send(to) {
      if (!/^\d{8,15}$/.test(to)) return { ok: false, error: "Recipient is not a valid WhatsApp number" };
      return { ok: true, waMessageId: `sbx.${randomToken(12)}` };
    },
    async submitTemplate() {
      return { ok: true, id: `sbx-tpl.${randomToken(8)}` };
    },
    async templateStatus() {
      return null; // reviewed by the sandbox.template_review job
    },
    async health(): Promise<HealthCheck[]> {
      return [
        { id: "token", label: "Access token works", ok: true, detail: "Sandbox numbers need no token." },
        { id: "number", label: "Phone number registered", ok: true, detail: "Sandbox number, messages go to /sandbox." },
        { id: "quality", label: "Quality rating", ok: true, detail: "GREEN" },
        { id: "subscribed", label: "App subscribed to this WhatsApp account", ok: true, detail: "Built in." },
        { id: "webhook", label: "Webhook events arriving", ok: true, detail: "Sandbox events are delivered internally." },
      ];
    },
  };
}

const BLOCKED = [/\bguaranteed\b/i, /\b100% free\b/i, /\bclick here\b/i];

/** What the sandbox reviewer decides. Mirrors the most common real rejection reasons. */
export function sandboxReview(body: string, variableCount: number): { approved: boolean; reason?: string } {
  if (body.trim().startsWith("{{") || body.trim().endsWith("}}"))
    return { approved: false, reason: "Variables can't be at the start or end of the body." };
  const words = body.replace(/\{\{\d+\}\}/g, "").trim().split(/\s+/).filter(Boolean).length;
  if (variableCount > 0 && words < variableCount * 3)
    return { approved: false, reason: "Too many variables for the amount of text." };
  const hit = BLOCKED.find((r) => r.test(body));
  if (hit) return { approved: false, reason: "Promotional wording Meta often rejects." };
  return { approved: true };
}
