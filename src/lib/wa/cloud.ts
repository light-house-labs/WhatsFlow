/* eslint-disable @typescript-eslint/no-explicit-any -- Meta webhook and Graph API bodies are untyped JSON, read defensively field by field */
import { freshFileUrl } from "@/lib/storage";
import { assertPublicUrl } from "@/lib/net-guard";
import { isMediaHeader, type HealthCheck, type Outbound, type SendResult, type TemplateRef, type WhatsAppProvider } from "./types";

type Cfg = { phoneNumberId: string; wabaId: string; accessToken: string; lastWebhookAt: Date | null };

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;

async function graph(path: string, token: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${GRAPH()}/${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    const e = json?.error;
    throw new Error(e?.error_user_msg || e?.message || `Graph API ${res.status}`);
  }
  return json;
}

function toCloudPayload(to: string, msg: Outbound): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (msg.kind) {
    case "text":
      return { ...base, type: "text", text: { body: msg.body, preview_url: true } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: msg.body },
          action: {
            buttons: msg.buttons.map((title, i) => ({ type: "reply", reply: { id: `btn:${i}`, title } })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: msg.body },
          action: {
            button: msg.button,
            sections: [{ title: "Options", rows: msg.rows.map((title, i) => ({ id: `row:${i}`, title })) }],
          },
        },
      };
    case "media":
      return {
        ...base,
        type: msg.mediaType,
        [msg.mediaType]: {
          link: msg.link,
          ...(msg.caption && msg.mediaType !== "audio" ? { caption: msg.caption } : {}),
          ...(msg.mediaType === "document" && msg.filename ? { filename: msg.filename } : {}),
        },
      };
    case "template": {
      const components: Record<string, unknown>[] = [];
      const t = msg.template;
      if (isMediaHeader(t) && t.headerMediaUrl) {
        const link = freshFileUrl(t.headerMediaUrl);
        components.push({ type: "header", parameters: [{ type: t.headerType, [t.headerType]: { link } }] });
      }
      if (msg.variables.length) components.push({ type: "body", parameters: msg.variables.map((text) => ({ type: "text", text })) });
      return { ...base, type: "template", template: { name: t.name, language: { code: t.language }, components } };
    }
  }
}

/**
 * Template header samples and profile photos go through Meta's Resumable
 * Upload API, which belongs to the Meta app (META_APP_ID), not the WABA.
 */
async function uploadSample(url: string, token: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("Set META_APP_ID to upload images, videos or documents to Meta (template headers, profile photo).");
  const link = freshFileUrl(url);
  await assertPublicUrl(link);
  const file = await fetch(link, { cache: "no-store" });
  if (!file.ok) throw new Error(`Couldn't download the file for Meta (${file.status}).`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = file.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
  const session = await graph(`${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`, token, { method: "POST" });
  const res = await fetch(`${GRAPH()}/${session.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_offset: "0" },
    body: bytes,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || !json.h) throw new Error(json?.error?.message ?? "Meta didn't accept the uploaded file.");
  return String(json.h);
}

export function cloudProvider(cfg: Cfg): WhatsAppProvider {
  return {
    async send(to, msg): Promise<SendResult> {
      try {
        const json = await graph(`${cfg.phoneNumberId}/messages`, cfg.accessToken, {
          method: "POST",
          body: toCloudPayload(to, msg),
        });
        return { ok: true, waMessageId: json.messages?.[0]?.id };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async updateProfile(p) {
      try {
        const body: Record<string, unknown> = { messaging_product: "whatsapp" };
        for (const k of ["about", "description", "address", "email", "vertical"] as const) if (p[k] !== undefined) body[k] = p[k];
        if (p.website !== undefined) body.websites = p.website ? [p.website] : [];
        if (p.photoUrl) body.profile_picture_handle = await uploadSample(p.photoUrl, cfg.accessToken);
        await graph(`${cfg.phoneNumberId}/whatsapp_business_profile`, cfg.accessToken, { method: "POST", body });
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    },

    async submitTemplate(t: TemplateRef) {
      const components: Record<string, unknown>[] = [];
      if (isMediaHeader(t)) {
        if (!t.headerMediaUrl) return { ok: false as const, error: "Add a sample file for the header." };
        try {
          const handle = await uploadSample(t.headerMediaUrl, cfg.accessToken);
          components.push({ type: "HEADER", format: t.headerType.toUpperCase(), example: { header_handle: [handle] } });
        } catch (e) {
          return { ok: false as const, error: (e as Error).message };
        }
      } else if (t.headerText) components.push({ type: "HEADER", format: "TEXT", text: t.headerText });
      const sampleCount = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].length;
      components.push({
        type: "BODY",
        text: t.body,
        ...(sampleCount
          ? { example: { body_text: [Array.from({ length: sampleCount }, (_, i) => `sample${i + 1}`)] } }
          : {}),
      });
      if (t.footer) components.push({ type: "FOOTER", text: t.footer });
      if (t.buttons.length)
        components.push({
          type: "BUTTONS",
          buttons: t.buttons.map((b) =>
            b.type === "URL"
              ? { type: "URL", text: b.text, url: b.url }
              : b.type === "PHONE_NUMBER"
                ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone }
                : { type: "QUICK_REPLY", text: b.text },
          ),
        });
      try {
        const json = await graph(`${cfg.wabaId}/message_templates`, cfg.accessToken, {
          method: "POST",
          body: { name: t.name, language: t.language, category: t.category, components },
        });
        return { ok: true as const, id: String(json.id) };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    },

    async templateStatus(id) {
      try {
        const json = await graph(`${id}?fields=status,rejected_reason`, cfg.accessToken);
        const s = String(json.status).toLowerCase();
        if (s === "approved") return { status: "approved" };
        if (s === "rejected") return { status: "rejected", reason: json.rejected_reason };
        return { status: "pending" };
      } catch {
        return null;
      }
    },

    async fetchMedia(mediaId) {
      try {
        const meta = await graph(mediaId, cfg.accessToken);
        const res = await fetch(String(meta.url), { headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store" });
        if (!res.ok) return null;
        return { body: await res.arrayBuffer(), contentType: String(meta.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream") };
      } catch {
        return null;
      }
    },

    async health(): Promise<HealthCheck[]> {
      const checks: HealthCheck[] = [];
      let phone: Record<string, any> | null = null;
      try {
        phone = await graph(
          `${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier`,
          cfg.accessToken,
        );
        checks.push({ id: "token", label: "Access token works", ok: true, detail: "Meta accepted the token." });
      } catch (e) {
        checks.push({
          id: "token",
          label: "Access token works",
          ok: false,
          detail: (e as Error).message,
          fix: "Create a permanent System User token in Meta Business Settings with whatsapp_business_messaging and whatsapp_business_management, then paste it again.",
        });
      }
      if (phone) {
        checks.push({
          id: "number",
          label: "Phone number registered",
          ok: true,
          detail: `${phone.display_phone_number} · ${phone.verified_name}`,
        });
        const q = String(phone.quality_rating ?? "UNKNOWN");
        checks.push({
          id: "quality",
          label: "Quality rating",
          ok: q === "GREEN" || q === "UNKNOWN",
          detail: `${q}${phone.messaging_limit_tier ? ` · limit ${phone.messaging_limit_tier}` : ""}`,
          fix: q === "GREEN" || q === "UNKNOWN" ? undefined : "Pause marketing broadcasts and send only to people who messaged you recently until the rating recovers.",
        });
      }
      try {
        const subs = await graph(`${cfg.wabaId}/subscribed_apps`, cfg.accessToken);
        const ok = Array.isArray(subs.data) && subs.data.length > 0;
        checks.push({
          id: "subscribed",
          label: "App subscribed to this WhatsApp account",
          ok,
          detail: ok ? "Webhooks will be delivered." : "No app is subscribed, so incoming messages will never reach us.",
          fix: ok ? undefined : "Click “Fix subscription” below, or call POST /{waba-id}/subscribed_apps with your token.",
        });
      } catch (e) {
        checks.push({ id: "subscribed", label: "App subscribed to this WhatsApp account", ok: false, detail: (e as Error).message });
      }
      const recent = cfg.lastWebhookAt && Date.now() - cfg.lastWebhookAt.getTime() < 7 * 86400_000;
      checks.push({
        id: "webhook",
        label: "Webhook events arriving",
        ok: Boolean(recent),
        detail: cfg.lastWebhookAt ? `Last event ${cfg.lastWebhookAt.toISOString()}` : "No events received yet.",
        fix: recent
          ? undefined
          : "In your Meta app → WhatsApp → Configuration, set the callback URL and verify token shown on this page, and subscribe to the “messages” field. Then send a message to your number.",
      });
      return checks;
    },
  };
}

export async function subscribeApp(wabaId: string, token: string) {
  await graph(`${wabaId}/subscribed_apps`, token, { method: "POST" });
}
