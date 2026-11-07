import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";

export function newApiKey() {
  const key = `wf_live_${randomToken(24)}`;
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
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
  if (need === "full" && row.k.scope !== "full") return { error: apiError(403, "forbidden", "This key is read-only.") } as const;
  if (row.org.billingStatus === "cancelled") return { error: apiError(402, "plan_cancelled", "This workspace's plan is cancelled.") } as const;
  if (!row.k.lastUsedAt || Date.now() - row.k.lastUsedAt.getTime() > 60_000) {
    await d.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.k.id));
  }
  return { d, orgId: row.org.id, org: row.org, key: row.k } as const;
}
