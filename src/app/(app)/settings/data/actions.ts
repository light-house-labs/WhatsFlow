"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export async function deleteWorkspace(form: FormData) {
  const ctx = await requireOrg("owner");
  if (String(form.get("confirm") ?? "").trim() !== ctx.org.name) {
    redirect(`/settings/data?error=${encodeURIComponent("The name didn't match, so nothing was deleted.")}`);
  }
  // Cascades remove every workspace row: numbers (and their tokens), contacts, chats, orders, keys.
  await ctx.db.delete(schema.orgs).where(eq(schema.orgs.id, ctx.org.id));
  await ctx.db.update(schema.sessions).set({ orgId: null }).where(eq(schema.sessions.orgId, ctx.org.id));
  await sendMail(
    ctx.user.email,
    `${ctx.org.name} was deleted`,
    `Your WhatsFlow workspace “${ctx.org.name}” and its data were deleted. Your plan is cancelled and you won't be charged again.`,
  );
  redirect("/onboarding");
}
