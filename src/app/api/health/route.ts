import { NextResponse } from "next/server";
import { db } from "@/db";
import { healthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

/** For uptime monitors: 200 while we can serve requests, 503 when we can't. */
export async function GET() {
  const h = await healthChecks(await db()).catch(() => ({ state: "down" as const, checks: [], checkedAt: new Date().toISOString() }));
  const appDown = !h.checks.length || h.checks.some((c) => c.id === "app" && c.state === "down");
  return NextResponse.json(h, { status: appDown ? 503 : 200, headers: { "cache-control": "no-store" } });
}
