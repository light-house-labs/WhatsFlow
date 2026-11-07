import type { InferSelectModel } from "drizzle-orm";
import type { schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { cloudProvider } from "./cloud";
import { sandboxProvider } from "./sandbox";
import type { WhatsAppProvider } from "./types";

export type WaNumber = InferSelectModel<typeof schema.waNumbers>;

export function providerFor(n: WaNumber): WhatsAppProvider {
  if (n.provider === "sandbox") return sandboxProvider();
  if (!n.phoneNumberId || !n.wabaId || !n.accessTokenEnc) {
    throw new Error("This number is missing its Meta connection details.");
  }
  return cloudProvider({
    phoneNumberId: n.phoneNumberId,
    wabaId: n.wabaId,
    accessToken: decrypt(n.accessTokenEnc),
    lastWebhookAt: n.lastWebhookAt,
  });
}

export * from "./types";
