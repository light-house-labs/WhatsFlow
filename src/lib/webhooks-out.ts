import { createHmac } from "node:crypto";

/** Signature header value our customers verify: HMAC-SHA256 over "<timestamp>.<body>". */
export function signWebhook(secret: string, timestamp: number, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
