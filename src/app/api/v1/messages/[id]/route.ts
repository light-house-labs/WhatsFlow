import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { apiAuth, apiError } from "@/lib/api-auth";
import { messageJson } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiAuth(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(404, "not_found", "No such message.");
  const [m] = await auth.d.select().from(schema.messages).where(and(eq(schema.messages.id, id), eq(schema.messages.orgId, auth.orgId)));
  if (!m) return apiError(404, "not_found", "No such message.");
  return NextResponse.json({ data: messageJson(m) });
}
