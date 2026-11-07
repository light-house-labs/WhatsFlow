"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { BusinessHours, Role } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { encrypt, randomToken, sha256 } from "@/lib/crypto";
import { limitsFor } from "@/lib/plans";
import { cloudProvider, subscribeApp } from "@/lib/wa/cloud";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export async function saveInboxSettings(form: FormData) {
  const ctx = await requireOrg("admin");
  const hours: BusinessHours = {};
  for (const d of DAYS) {
    hours[d] = form.get(`${d}_on`) === "on" ? { open: String(form.get(`${d}_open`) || "09:00"), close: String(form.get(`${d}_close`) || "18:00") } : null;
  }
  const tz = String(form.get("timezone") || "Asia/Kolkata");
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    redirect("/settings?error=tz");
  }
  await ctx.db
    .update(schema.inboxSettings)
    .set({
      welcomeEnabled: form.get("welcomeEnabled") === "on",
      welcomeMessage: String(form.get("welcomeMessage") ?? "").trim() || "Hi! How can we help?",
      awayEnabled: form.get("awayEnabled") === "on",
      awayMessage: String(form.get("awayMessage") ?? "").trim() || "We're closed right now and will reply when we open.",
      businessHours: hours,
      waitAlertMinutes: Math.max(1, Math.min(1440, Number(form.get("waitAlertMinutes")) || 15)),
      optOutKeywords: String(form.get("optOutKeywords") ?? "STOP").split(",").map((k) => k.trim()).filter(Boolean),
    })
    .where(eq(schema.inboxSettings.orgId, ctx.org.id));
  await ctx.db.update(schema.orgs).set({ timezone: tz, name: String(form.get("orgName") ?? ctx.org.name).trim() || ctx.org.name }).where(eq(schema.orgs.id, ctx.org.id));
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function addQuickReply(form: FormData) {
  const ctx = await requireOrg();
  const shortcut = String(form.get("shortcut") ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const body = String(form.get("body") ?? "").trim();
  if (!shortcut || !body) return;
  await ctx.db
    .insert(schema.quickReplies)
    .values({ orgId: ctx.org.id, shortcut, body })
    .onConflictDoUpdate({ target: [schema.quickReplies.orgId, schema.quickReplies.shortcut], set: { body } });
  revalidatePath("/settings");
}

export async function deleteQuickReply(form: FormData) {
  const ctx = await requireOrg();
  await ctx.db.delete(schema.quickReplies).where(and(eq(schema.quickReplies.id, String(form.get("id"))), eq(schema.quickReplies.orgId, ctx.org.id)));
  revalidatePath("/settings");
}

// ---------- team ----------

export type InviteState = { error?: string; link?: string } | undefined;

export async function invite(_: InviteState, form: FormData): Promise<InviteState> {
  const ctx = await requireOrg("admin");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "agent") as Role;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  if (role === "owner" && ctx.role !== "owner") return { error: "Only an owner can invite another owner." };
  const [members] = await ctx.db.select({ n: sql<number>`count(*)` }).from(schema.memberships).where(eq(schema.memberships.orgId, ctx.org.id));
  const seats = limitsFor(ctx.org.plan).seats;
  if (Number(members.n) >= seats) return { error: `Your plan includes ${seats} team members. Upgrade or remove someone first.` };
  const token = randomToken(24);
  await ctx.db.insert(schema.invites).values({ orgId: ctx.org.id, email, role, tokenHash: sha256(token), invitedBy: ctx.user.id });
  revalidatePath("/settings/team");
  return { link: `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}` };
}

export async function changeRole(form: FormData) {
  const ctx = await requireOrg("admin");
  const userId = String(form.get("userId"));
  const role = String(form.get("role")) as Role;
  if (userId === ctx.user.id) redirect("/settings/team?error=self");
  if (role === "owner" && ctx.role !== "owner") redirect("/settings/team?error=owner");
  const [target] = await ctx.db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId))).limit(1);
  if (target?.role === "owner" && ctx.role !== "owner") redirect("/settings/team?error=owner");
  await ctx.db.update(schema.memberships).set({ role }).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)));
  revalidatePath("/settings/team");
}

export async function removeMember(form: FormData) {
  const ctx = await requireOrg("admin");
  const userId = String(form.get("userId"));
  if (userId === ctx.user.id) redirect("/settings/team?error=self");
  const [target] = await ctx.db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId))).limit(1);
  if (!target) return;
  if (target.role === "owner" && ctx.role !== "owner") redirect("/settings/team?error=owner");
  // their open chats go back to the unassigned queue
  await ctx.db.update(schema.conversations).set({ assigneeId: null }).where(and(eq(schema.conversations.orgId, ctx.org.id), eq(schema.conversations.assigneeId, userId)));
  await ctx.db.delete(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)));
  revalidatePath("/settings/team");
}

export async function revokeInvite(form: FormData) {
  const ctx = await requireOrg("admin");
  await ctx.db.delete(schema.invites).where(and(eq(schema.invites.id, String(form.get("id"))), eq(schema.invites.orgId, ctx.org.id)));
  revalidatePath("/settings/team");
}

// ---------- WhatsApp numbers ----------

export type ConnectState = { error?: string } | undefined;

export async function connectCloudNumber(_: ConnectState, form: FormData): Promise<ConnectState> {
  const ctx = await requireOrg("admin");
  const phoneNumberId = String(form.get("phoneNumberId") ?? "").trim();
  const wabaId = String(form.get("wabaId") ?? "").trim();
  const token = String(form.get("accessToken") ?? "").trim();
  if (!/^\d{6,}$/.test(phoneNumberId)) return { error: "The Phone number ID is a long number from WhatsApp → API Setup in your Meta app." };
  if (!/^\d{6,}$/.test(wabaId)) return { error: "The WhatsApp Business Account ID is a long number from the same page." };
  if (token.length < 20) return { error: "Paste the full access token." };
  return saveCloudNumber(ctx, phoneNumberId, wabaId, token);
}

async function saveCloudNumber(ctx: Awaited<ReturnType<typeof requireOrg>>, phoneNumberId: string, wabaId: string, token: string): Promise<ConnectState> {
  const numbers = await ctx.db.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, ctx.org.id));
  const realOnes = numbers.filter((n) => n.provider === "cloud" && n.status !== "disconnected");
  if (realOnes.length >= limitsFor(ctx.org.plan).numbers) return { error: `Your plan includes ${limitsFor(ctx.org.plan).numbers} WhatsApp number(s).` };
  if (numbers.some((n) => n.phoneNumberId === phoneNumberId && n.status !== "disconnected")) return { error: "That number is already connected." };

  // Check with Meta before saving anything.
  const checks = await cloudProvider({ phoneNumberId, wabaId, accessToken: token, lastWebhookAt: null }).health();
  const tokenOk = checks.find((c) => c.id === "token")?.ok;
  if (!tokenOk) return { error: checks.find((c) => c.id === "token")?.detail ?? "Meta rejected the token." };
  const numberDetail = checks.find((c) => c.id === "number")?.detail ?? "";
  const [display, name] = numberDetail.split(" · ");
  try {
    await subscribeApp(wabaId, token);
  } catch {
    // reported on the health page; not fatal
  }
  const [n] = await ctx.db
    .insert(schema.waNumbers)
    .values({
      orgId: ctx.org.id,
      provider: "cloud",
      phoneNumberId,
      wabaId,
      accessTokenEnc: encrypt(token),
      displayPhone: display || phoneNumberId,
      displayName: name || ctx.org.name,
      verifyToken: randomToken(16),
      status: "pending",
      statusDetail: "Waiting for the first webhook from Meta.",
      qualityRating: checks.find((c) => c.id === "quality")?.detail.split(" ")[0] ?? null,
    })
    .returning();
  redirect(`/settings/whatsapp?n=${n.id}`);
}

/**
 * Finish Meta Embedded Signup: swap the one-time code for a business token,
 * register the number for Cloud API, then connect it like a pasted token.
 */
export async function completeEmbeddedSignup(code: string, phoneNumberId: string, wabaId: string): Promise<ConnectState> {
  const ctx = await requireOrg("admin");
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return { error: "Embedded Signup isn't configured on this server." };
  if (!/^\d{6,}$/.test(phoneNumberId) || !/^\d{6,}$/.test(wabaId) || !code) return { error: "Meta didn't send the number details. Try again." };
  const graph = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;
  const tokenRes = await fetch(`${graph}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, code })}`, { cache: "no-store" });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!tokenRes.ok || !tokenJson.access_token) return { error: tokenJson.error?.message ?? "Meta didn't accept the sign-up code." };
  const token = tokenJson.access_token;
  // Register the number for Cloud API. A number that is already registered returns an error we can ignore.
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  await fetch(`${graph}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  }).catch(() => null);
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action: "whatsapp.embedded_signup", target: phoneNumberId });
  return saveCloudNumber(ctx, phoneNumberId, wabaId, token);
}

export async function fixSubscription(form: FormData) {
  const ctx = await requireOrg("admin");
  const [n] = await ctx.db.select().from(schema.waNumbers).where(and(eq(schema.waNumbers.id, String(form.get("id"))), eq(schema.waNumbers.orgId, ctx.org.id))).limit(1);
  if (n?.provider === "cloud" && n.wabaId && n.accessTokenEnc) {
    const { decrypt } = await import("@/lib/crypto");
    await subscribeApp(n.wabaId, decrypt(n.accessTokenEnc)).catch(() => undefined);
  }
  revalidatePath("/settings/whatsapp");
}

export async function disconnectNumber(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  // Drop the token so we can never act on the number again; keep history.
  await ctx.db
    .update(schema.waNumbers)
    .set({ status: "disconnected", accessTokenEnc: null, statusDetail: `Disconnected ${new Date().toISOString()}` })
    .where(and(eq(schema.waNumbers.id, id), eq(schema.waNumbers.orgId, ctx.org.id), eq(schema.waNumbers.provider, "cloud")));
  await ctx.db.insert(schema.auditLog).values({ orgId: ctx.org.id, actorId: ctx.user.id, action: "number.disconnected", target: id });
  redirect("/settings/whatsapp?disconnected=1");
}
