"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession, requireUser, setSessionOrg } from "@/lib/auth";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";
import { createWorkspace } from "@/lib/org-setup";
import { limitsFor } from "@/lib/plans";
import { clientIp, hit } from "@/lib/rate-limit";
import { NO_LOCAL_PASSWORD, sbCreateUser, sbEnsureUser, sbSetPassword, sbSignIn, supabaseAuthEnabled } from "@/lib/supabase-auth";

const SLOW_DOWN = "Too many attempts. Wait a few minutes and try again.";

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
  // never send the password back down in form state
  const { password: _pw, ...keep } = raw;
  void _pw;
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: keep };
  const v = parsed.data;
  const d = await db();
  if (!(await hit(d, `signup-ip:${await clientIp()}`, 10, 3600)).ok) return { error: SLOW_DOWN, fields: keep };
  const [exists] = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, v.email)).limit(1);
  if (exists) return { error: "An account with this email already exists. Log in instead.", fields: keep };
  let credential: { passwordHash: string; authUserId: string | null } = { passwordHash: await hashPassword(v.password), authUserId: null };
  if (supabaseAuthEnabled()) {
    const created = await sbCreateUser(v.email, v.password, v.name);
    if ("error" in created) {
      return {
        error: created.error === "exists" ? "An account with this email already exists. Log in instead." : "Sign-up is temporarily unavailable. Try again in a minute.",
        fields: keep,
      };
    }
    credential = { passwordHash: NO_LOCAL_PASSWORD, authUserId: created.id };
  }
  const [user] = await d
    .insert(schema.users)
    .values({ name: v.name, email: v.email, phone: v.phone || null, ...credential, marketingOptIn: v.marketing === "on" })
    .returning();
  await createSession(user.id, null);
  redirect(v.next?.startsWith("/invite/") ? v.next : "/onboarding");
}

type AppUser = typeof schema.users.$inferSelect;
type AuthResult = { status: "ok"; user: AppUser } | { status: "invalid" } | { status: "unavailable" };

/** Checks an email and password against the credential store and returns the app's user row. */
async function authenticate(d: Awaited<ReturnType<typeof db>>, email: string, password: string): Promise<AuthResult> {
  const [local] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!supabaseAuthEnabled()) {
    return local && (await verifyPassword(password, local.passwordHash)) ? { status: "ok", user: local } : { status: "invalid" };
  }

  const sb = await sbSignIn(email, password);
  if (sb.status === "unavailable") return sb;

  if (sb.status === "ok") {
    const [linked] = await d.select().from(schema.users).where(eq(schema.users.authUserId, sb.id)).limit(1);
    if (linked) return { status: "ok", user: linked };
    // Identities are linked by id, never by email: an existing app account must not be claimed
    // by whoever registered the same address in Supabase.
    if (local) return { status: "invalid" };
    // Created straight in Supabase (dashboard or API): give them an app profile on first login.
    const [created] = await d
      .insert(schema.users)
      .values({ email: sb.email, name: sb.name ?? sb.email.split("@")[0], passwordHash: NO_LOCAL_PASSWORD, authUserId: sb.id })
      .onConflictDoNothing()
      .returning();
    return created ? { status: "ok", user: created } : { status: "invalid" };
  }

  // Not in Supabase with this password. An account from before Supabase Auth still has a local hash:
  // if that matches, move the credential across now so the next login goes straight through.
  if (local && !local.authUserId && (await verifyPassword(password, local.passwordHash))) {
    const authUserId = await sbEnsureUser(d, local.email, password, local.name);
    if (!authUserId) return { status: "unavailable" };
    await d.update(schema.users).set({ authUserId, passwordHash: NO_LOCAL_PASSWORD }).where(eq(schema.users.id, local.id));
    return { status: "ok", user: { ...local, authUserId, passwordHash: NO_LOCAL_PASSWORD } };
  }
  return { status: "invalid" };
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const d = await db();
  // per account and per network, so neither one guessed password list nor one busy office gets through
  const [byEmail, byIp] = [await hit(d, `login:${email}`, 10, 900), await hit(d, `login-ip:${await clientIp()}`, 50, 900)];
  if (!byEmail.ok || !byIp.ok) return { error: SLOW_DOWN, fields: { email } };
  const result = await authenticate(d, email, password);
  if (result.status === "unavailable") return { error: "Login is temporarily unavailable. Try again in a minute.", fields: { email } };
  if (result.status === "invalid") return { error: "That email and password don't match.", fields: { email } };
  const user = result.user;
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

const RESET_MINUTES = 30;

/** Always answers the same way, so the form can't be used to find out who has an account. */
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const d = await db();
  const [byEmail, byIp] = [await hit(d, `reset:${email}`, 3, 3600), await hit(d, `reset-ip:${await clientIp()}`, 20, 3600)];
  if (!byEmail.ok || !byIp.ok) return { error: SLOW_DOWN };
  const [user] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (user) {
    const token = randomToken(24);
    await d.insert(schema.passwordResets).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password/${token}`;
    await sendMail(user.email, "Reset your Harbor password", `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in ${RESET_MINUTES} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`);
  }
  return { error: undefined, fields: { sent: "1" } };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const d = await db();
  const [row] = await d
    .select()
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.tokenHash, sha256(token)), isNull(schema.passwordResets.usedAt)))
    .limit(1);
  if (!row || row.expiresAt < new Date()) return { error: "This link has expired or was already used. Ask for a new one." };
  if (supabaseAuthEnabled()) {
    const [u] = await d.select().from(schema.users).where(eq(schema.users.id, row.userId)).limit(1);
    if (!u) return { error: "This link has expired or was already used. Ask for a new one." };
    // Linked accounts get their Supabase password replaced; older ones are moved across now.
    const authUserId = u.authUserId
      ? (await sbSetPassword(u.authUserId, password)) ? u.authUserId : null
      : await sbEnsureUser(d, u.email, password, u.name);
    if (!authUserId) return { error: "We couldn't save your new password right now. Try again in a minute." };
    await d.update(schema.users).set({ authUserId, passwordHash: NO_LOCAL_PASSWORD }).where(eq(schema.users.id, u.id));
  } else {
    await d.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, row.userId));
  }
  await d.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, row.id));
  // sign out everywhere else
  await d.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
  const [m] = await d.select().from(schema.memberships).where(eq(schema.memberships.userId, row.userId)).limit(1);
  await createSession(row.userId, m?.orgId ?? null);
  redirect(m ? "/inbox" : "/onboarding");
}
