import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "wf_session";
const SESSION_DAYS = 30;

const RANK: Record<Role, number> = { agent: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export async function createSession(userId: string, orgId: string | null) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const d = await db();
  await d.insert(schema.sessions).values({ tokenHash: sha256(token), userId, orgId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const d = await db();
    await d.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  store.delete(COOKIE);
}

/** One query per request: the session, its user, and (when a workspace is selected) the membership and workspace. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const d = await db();
  const [row] = await d
    .select({ session: schema.sessions, user: schema.users, org: schema.orgs, role: schema.memberships.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.memberships, and(eq(schema.memberships.orgId, schema.sessions.orgId), eq(schema.memberships.userId, schema.sessions.userId)))
    .leftJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function setSessionOrg(orgId: string) {
  const s = await requireUser();
  const d = await db();
  await d.update(schema.sessions).set({ orgId }).where(eq(schema.sessions.id, s.session.id));
}

export type OrgContext = Awaited<ReturnType<typeof loadOrgContext>>;

const loadOrgContext = cache(async () => {
  const s = await requireUser();
  if (!s.org || !s.role) return null;
  return { user: s.user, org: s.org, role: s.role, db: await db() };
});

/**
 * The signed-in user's current workspace. Every data access goes through this,
 * and every query filters by `ctx.org.id`.
 */
export async function requireOrg(min: Role = "agent") {
  const ctx = await loadOrgContext();
  if (!ctx) redirect("/onboarding");
  if (!roleAtLeast(ctx.role, min)) redirect("/dashboard?denied=1");
  return ctx;
}

/** Same as requireOrg, for route handlers: returns null instead of redirecting. */
export async function orgOrNull(min: Role = "agent") {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const ctx = await loadOrgContext().catch(() => null);
  if (!ctx || !roleAtLeast(ctx.role, min)) return null;
  return ctx;
}
