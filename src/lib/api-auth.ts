import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { hit, retryAfter } from "./rate-limit";

/** Requests per minute per API key. */
export const API_RATE_PER_MINUTE = Number(process.env.API_RATE_PER_MINUTE ?? 120);

export function newApiKey() {
  const key = `wf_live_${randomToken(24)}`;
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
}

/** Which key made a request, so `logged` can record it once the handler answers. */
const callers = new WeakMap<Request, { orgId: string; keyId: string }>();

/**
 * Wrap a /api/v1 handler so every authenticated call lands in the request log.
 * Unknown keys aren't logged: there is no workspace to log them against.
 */
export function logged<A extends unknown[]>(handler: (req: Request, ...rest: A) => Promise<Response | undefined>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const started = Date.now();
    let res: Response;
    try {
      res = (await handler(req, ...rest)) ?? apiError(500, "server_error", "Something went wrong on our side. Try again.");
    } catch (e) {
      console.error("[api]", e);
      res = apiError(500, "server_error", "Something went wrong on our side. Try again.");
    }
    const who = callers.get(req);
    if (who) {
      let error: string | null = null;
      if (res.status >= 400) error = await res.clone().json().then((b) => String(b?.error?.code ?? "") || null, () => null);
      const d = await db();
      await d
        .insert(schema.apiRequests)
        .values({ orgId: who.orgId, keyId: who.keyId, method: req.method, path: new URL(req.url).pathname.slice(0, 200), status: res.status, durationMs: Date.now() - started, error })
        .catch((e) => console.error("[api-log]", e));
    }
    return res;
  };
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Authenticate a developer API request by its Bearer key. */
export async function apiAuth(req: Request, need: "read" | "full" = "read") {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key.startsWith("wf_live_")) return { error: apiError(401, "unauthorized", "Send your API key as: Authorization: Bearer wf_live_…") } as const;
  const d = await db();
  const [row] = await d
    .select({ k: schema.apiKeys, org: schema.orgs })
    .from(schema.apiKeys)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.apiKeys.orgId))
    .where(and(eq(schema.apiKeys.keyHash, sha256(key)), isNull(schema.apiKeys.revokedAt)))
    .limit(1);
  if (!row) return { error: apiError(401, "unauthorized", "Unknown or revoked API key.") } as const;
  callers.set(req, { orgId: row.org.id, keyId: row.k.id });
  if (need === "full" && row.k.scope !== "full") return { error: apiError(403, "forbidden", "This key is read-only.") } as const;
  if (row.org.billingStatus === "cancelled") return { error: apiError(402, "plan_cancelled", "This workspace's plan is cancelled.") } as const;
  const rate = await hit(d, `api:${row.k.id}`, API_RATE_PER_MINUTE, 60);
  if (!rate.ok) {
    const res = apiError(429, "rate_limited", `Slow down: this key can make ${rate.limit} requests a minute.`);
    res.headers.set("Retry-After", String(retryAfter(rate)));
    res.headers.set("X-RateLimit-Limit", String(rate.limit));
    res.headers.set("X-RateLimit-Remaining", "0");
    return { error: res } as const;
  }
  if (!row.k.lastUsedAt || Date.now() - row.k.lastUsedAt.getTime() > 60_000) {
    await d.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.k.id));
  }
  return { d, orgId: row.org.id, org: row.org, key: row.k } as const;
}
