"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession, requireUser, setSessionOrg } from "@/lib/auth";
import { hashPassword, sha256, verifyPassword } from "@/lib/crypto";
import { createWorkspace } from "@/lib/org-setup";
import { limitsFor } from "@/lib/plans";

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Use at least 8 characters"),
  terms: z.literal("on", { message: "Please accept the terms to continue" }),
  marketing: z.string().optional(),
  next: z.string().optional(),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form) as Record<string, string>;
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: raw };
  const v = parsed.data;
  const d = await db();
  const [exists] = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, v.email)).limit(1);
  if (exists) return { error: "An account with this email already exists. Log in instead.", fields: raw };
  const [user] = await d
    .insert(schema.users)
    .values({ name: v.name, email: v.email, phone: v.phone || null, passwordHash: await hashPassword(v.password), marketingOptIn: v.marketing === "on" })
    .returning();
  await createSession(user.id, null);
  redirect(v.next?.startsWith("/invite/") ? v.next : "/onboarding");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const d = await db();
  const [user] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "That email and password don't match.", fields: { email } };
  }
  const [m] = await d.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id)).limit(1);
  await createSession(user.id, m?.orgId ?? null);
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  redirect(m ? "/inbox" : "/onboarding");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const wsSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(80),
  industry: z.string().trim().optional(),
});

export async function createOrg(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  const parsed = wsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = await db();
  const org = await createWorkspace(d, s.user.id, parsed.data.name, parsed.data.industry || null);
  await setSessionOrg(org.id);
  redirect("/dashboard?welcome=1");
}

export async function switchOrg(form: FormData) {
  const s = await requireUser();
  const orgId = String(form.get("orgId"));
  const d = await db();
  const [m] = await d
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, s.user.id)))
    .limit(1);
  if (m) await setSessionOrg(orgId);
  redirect("/inbox");
}

export async function acceptInvite(form: FormData) {
  const s = await requireUser();
  const token = String(form.get("token"));
  const d = await db();
  const [inv] = await d
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt)))
    .limit(1);
  if (!inv) redirect(`/invite/${token}?error=used`);
  if (inv.email.toLowerCase() !== s.user.email.toLowerCase()) redirect(`/invite/${token}?error=email`);
  const [org] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, inv.orgId)).limit(1);
  const members = await d.select().from(schema.memberships).where(eq(schema.memberships.orgId, inv.orgId));
  if (members.length >= limitsFor(org.plan).seats) redirect(`/invite/${token}?error=seats`);
  await d.insert(schema.memberships).values({ orgId: inv.orgId, userId: s.user.id, role: inv.role }).onConflictDoNothing();
  await d.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, inv.id));
  await setSessionOrg(inv.orgId);
  redirect("/inbox");
}
