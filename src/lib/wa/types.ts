import type { TemplateButton, TemplateHeaderType } from "@/db/schema";

export type TemplateRef = {
  name: string;
  language: string;
  headerText: string | null;
  headerType?: TemplateHeaderType | null;
  headerMediaUrl?: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
};

export type Outbound =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: string[] }
  | { kind: "list"; body: string; button: string; rows: string[] }
  | { kind: "template"; template: TemplateRef; variables: string[] }
  | { kind: "media"; mediaType: "image" | "document" | "video" | "audio"; link: string; caption?: string; filename?: string };

export type SendResult = { ok: true; waMessageId: string } | { ok: false; error: string };

export type HealthCheck = { id: string; label: string; ok: boolean; detail: string; fix?: string };

export interface WhatsAppProvider {
  send(to: string, msg: Outbound): Promise<SendResult>;
  submitTemplate(t: TemplateRef): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  templateStatus(id: string): Promise<{ status: "pending" | "approved" | "rejected"; reason?: string } | null>;
  health(): Promise<HealthCheck[]>;
  /** Download an inbound media file. Null if the provider has no media for this id. */
  fetchMedia(mediaId: string): Promise<{ body: ArrayBuffer; contentType: string } | null>;
}

/** Plain-text rendering of any outbound message, for previews and the sandbox phone. */
export function previewText(msg: Outbound): string {
  switch (msg.kind) {
    case "text":
      return msg.body;
    case "buttons":
      return msg.body;
    case "list":
      return msg.body;
    case "media":
      return msg.caption ? `[${msg.mediaType}] ${msg.caption}` : `[${msg.mediaType}] ${msg.filename ?? msg.link}`;
    case "template": {
      const body = msg.template.body.replace(/\{\{(\d+)\}\}/g, (_, n) => msg.variables[Number(n) - 1] ?? "");
      const media = isMediaHeader(msg.template) ? `[${msg.template.headerType}]` : null;
      return [media ?? msg.template.headerText, body, msg.template.footer].filter(Boolean).join("\n\n");
    }
  }
}

// WhatsApp interactive message limits
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_CHARS = 20;
export const MAX_LIST_ROWS = 10;
export const MAX_LIST_ROW_CHARS = 24;

export function isMediaHeader(t: Pick<TemplateRef, "headerType">): t is { headerType: "image" | "video" | "document" } {
  return t.headerType === "image" || t.headerType === "video" || t.headerType === "document";
}
