"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { SheetKind, StoreKind } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { storeConfigFor, type StoreConfig } from "@/lib/stores";
import { enqueue, kickJobs } from "@/lib/jobs";
import { prepareSheet, runSheetSync, SHEET_KINDS, spreadsheetIdFrom } from "@/lib/sheets";

export async function saveStore(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind")) as StoreKind;
  const v = (k: string) => String(form.get(k) ?? "").trim();
  let storeUrl = v("storeUrl").replace(/\/+$/, "");
  if (kind === "shopify") {
    storeUrl = storeUrl.replace(/^https?:\/\//, "");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(storeUrl)) redirect("/settings/integrations?error=shopify");
  } else if (kind === "woocommerce") {
    if (!/^https:\/\/[^\s/]+/i.test(storeUrl)) redirect("/settings/integrations?error=woocommerce");
  } else return;
  // a blank secret keeps the saved one
  const webhookSecret = v("webhookSecret") || (await storeConfigFor(ctx.db, ctx.org.id, kind))?.webhookSecret || "";
  if (webhookSecret.length < 16) redirect(`/settings/integrations?error=${kind}-secret`);
  const config: StoreConfig = {
    storeUrl,
    webhookSecret,
    cartMinutes: Math.min(24 * 60, Math.max(15, Number(v("cartMinutes")) || 60)),
    cartConsentOnly: form.get("cartConsentOnly") === "on",
  };
  const label = storeUrl.replace(/^https:\/\//, "");
  await ctx.db
    .insert(schema.integrations)
    .values({ orgId: ctx.org.id, kind, configEnc: encrypt(JSON.stringify(config)), label })
    .onConflictDoUpdate({ target: [schema.integrations.orgId, schema.integrations.kind], set: { configEnc: encrypt(JSON.stringify(config)), label, active: true } });
  await audit(ctx, "store.connected", label, { kind });
  revalidatePath("/settings/integrations");
  redirect(`/settings/integrations?saved=${kind}`);
}

export async function removeStore(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind"));
  if (kind !== "shopify" && kind !== "woocommerce") return;
  await ctx.db.delete(schema.integrations).where(and(eq(schema.integrations.orgId, ctx.org.id), eq(schema.integrations.kind, kind)));
  await audit(ctx, "store.disconnected", kind);
  revalidatePath("/settings/integrations");
}

const SHEET_KIND_LIST: SheetKind[] = ["leads", "appointments", "orders", "enquiries", "contacts"];

export async function connectSheet(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind")) as SheetKind;
  if (!SHEET_KIND_LIST.includes(kind)) return;
  const spreadsheetId = spreadsheetIdFrom(String(form.get("sheet") ?? ""));
  if (!spreadsheetId) redirect("/settings/integrations?sheetError=Paste+the+sheet's+link+from+your+browser's+address+bar#sheets");
  const tab = String(form.get("tab") ?? "").trim().slice(0, 80) || SHEET_KINDS[kind].tab;
  let title = "";
  try {
    title = await prepareSheet(spreadsheetId, tab, kind);
  } catch (e) {
    redirect(`/settings/integrations?sheetError=${encodeURIComponent((e as Error).message)}#sheets`);
  }
  // "From now on" by default; "include existing" backfills everything.
  const cursorAt = form.get("backfill") === "on" ? new Date(0) : new Date();
  await ctx.db
    .insert(schema.sheetSyncs)
    .values({ orgId: ctx.org.id, kind, spreadsheetId, tab, cursorAt })
    .onConflictDoUpdate({
      target: [schema.sheetSyncs.orgId, schema.sheetSyncs.kind],
      set: { spreadsheetId, tab, cursorAt, cursorId: null, rowsSynced: 0, lastError: null, lastSyncedAt: null, active: true },
    });
  await audit(ctx, "sheets.connected", `${SHEET_KINDS[kind].label} → ${title}`, { kind });
  await enqueue(ctx.db, "sheets.sync", {});
  kickJobs(ctx.db);
  revalidatePath("/settings/integrations");
  redirect("/settings/integrations?saved=sheets#sheets");
}

export async function removeSheet(form: FormData) {
  const ctx = await requireOrg("admin");
  const kind = String(form.get("kind"));
  await ctx.db.delete(schema.sheetSyncs).where(and(eq(schema.sheetSyncs.orgId, ctx.org.id), eq(schema.sheetSyncs.kind, kind as SheetKind)));
  await audit(ctx, "sheets.disconnected", kind);
  revalidatePath("/settings/integrations");
}

export async function syncSheetNow(form: FormData) {
  const ctx = await requireOrg("admin");
  const [sync] = await ctx.db
    .select()
    .from(schema.sheetSyncs)
    .where(and(eq(schema.sheetSyncs.orgId, ctx.org.id), eq(schema.sheetSyncs.kind, String(form.get("kind")) as SheetKind)))
    .limit(1);
  if (sync) await runSheetSync(ctx.db, sync);
  revalidatePath("/settings/integrations");
}
