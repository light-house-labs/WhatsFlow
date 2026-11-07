"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { cancelSubscription, changePlan, resumeSubscription } from "@/lib/billing";
import type { Plan } from "@/db/schema";

export async function choosePlan(form: FormData) {
  const ctx = await requireOrg("owner");
  const plan = String(form.get("plan")) as Plan;
  const interval = form.get("interval") === "year" ? "year" : "month";
  if (plan !== "starter" && plan !== "team") redirect("/settings/billing");
  const r = await changePlan(ctx.db, ctx.org.id, ctx.user.id, plan, interval);
  redirect(`/settings/billing?done=${r.kind}`);
}

export async function cancel(form: FormData) {
  const ctx = await requireOrg("owner");
  const reason = String(form.get("reason") ?? "") || null;
  await cancelSubscription(ctx.db, ctx.org.id, ctx.user.id, reason);
  redirect("/settings/billing?done=cancelled");
}

export async function resume() {
  const ctx = await requireOrg("owner");
  await resumeSubscription(ctx.db, ctx.org.id, ctx.user.id);
  redirect("/settings/billing?done=resumed");
}
