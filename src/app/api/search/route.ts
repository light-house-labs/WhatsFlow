import { NextResponse, type NextRequest } from "next/server";
import { orgOrNull } from "@/lib/auth";
import { searchEntities } from "@/lib/search/entities";
import { ENTITY_TYPES, type EntityType, type SearchResponse } from "@/lib/search/query";

export const dynamic = "force-dynamic";

/**
 * Records for the command palette: top 5 per type, scoped to the signed-in workspace and role.
 * `types` is a comma list (default all); `numbers=1` matches orders and tickets by number only;
 * `scope=messages` searches every message, not just the last 90 days, and returns up to 20.
 */
export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const allMessages = sp.get("scope") === "messages";
  const types = allMessages
    ? (["messages"] as EntityType[])
    : (sp.get("types") ?? "")
        .split(",")
        .filter((t): t is EntityType => (ENTITY_TYPES as readonly string[]).includes(t));
  const groups = q
    ? await searchEntities(ctx.db, {
        orgId: ctx.org.id,
        role: ctx.role,
        timezone: ctx.org.timezone,
        q,
        types,
        numbersOnly: sp.get("numbers") === "1",
        allMessages,
      })
    : [];
  const ms = Math.round(performance.now() - t0);
  return NextResponse.json({ groups, ms } satisfies SearchResponse, {
    headers: { "Server-Timing": `search;dur=${ms}`, "Cache-Control": "no-store" },
  });
}
