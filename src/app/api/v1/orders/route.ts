import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { schema } from "@/db";
import { logged, apiAuth } from "@/lib/api-auth";
import { pageParams } from "@/lib/api-v1";
import { orderJson } from "@/lib/orders";

export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const auth = await apiAuth(req);
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const { limit, before } = pageParams(url);
  const where = [eq(schema.orders.orgId, auth.orgId)];
  if (before) where.push(lt(schema.orders.createdAt, before));
  const rows = await auth.d.select().from(schema.orders).where(and(...where)).orderBy(desc(schema.orders.createdAt)).limit(limit);
  return NextResponse.json({ data: rows.map(orderJson), next: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null });
}

export const GET = logged(handleGET);
