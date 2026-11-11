import { Plug } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { storeConfigFor } from "@/lib/stores";
import { serviceAccount, SHEET_KINDS } from "@/lib/sheets";
import type { SheetKind } from "@/db/schema";
import { timeAgo } from "@/lib/format";
import { Alert, Badge, EmptyState, Field, Input, Select } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SettingsSection, Toggle } from "@/components/settings";
import { connectSheet, removeSheet, removeStore, saveStore, syncSheetNow } from "./actions";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "Connected apps" };

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const [rows, [keys], [hooks], [synced], [carts], sheets] = await Promise.all([
    d.select().from(schema.integrations).where(eq(schema.integrations.orgId, org.id)),
    d.select({ n: count() }).from(schema.apiKeys).where(and(eq(schema.apiKeys.orgId, org.id), isNull(schema.apiKeys.revokedAt))),
    d.select({ n: count() }).from(schema.webhookEndpoints).where(and(eq(schema.webhookEndpoints.orgId, org.id), eq(schema.webhookEndpoints.active, true))),
    d.select({ n: count() }).from(schema.orders).where(and(eq(schema.orders.orgId, org.id), isNotNull(schema.orders.externalId))),
    d.select({ n: count() }).from(schema.abandonedCarts).where(and(eq(schema.abandonedCarts.orgId, org.id), isNotNull(schema.abandonedCarts.remindedAt))),
    d.select().from(schema.sheetSyncs).where(eq(schema.sheetSyncs.orgId, org.id)),
  ]);
  const sa = serviceAccount();
  const unsynced = (Object.keys(SHEET_KINDS) as SheetKind[]).filter((k) => !sheets.some((s) => s.kind === k));
  const [shopify, woo] = await Promise.all([storeConfigFor(d, org.id, "shopify"), storeConfigFor(d, org.id, "woocommerce")]);
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const connected = rows.filter((r) => r.active).length + (keys.n ? 1 : 0) + (hooks.n ? 1 : 0) + (sheets.length ? 1 : 0);
  const apps = [
    { name: "Razorpay", on: rows.some((r) => r.kind === "razorpay"), href: "/settings/payments" },
    { name: "Stripe", on: rows.some((r) => r.kind === "stripe"), href: "/settings/payments" },
    { name: "Shopify", on: Boolean(shopify), href: "#shopify" },
    { name: "WooCommerce", on: Boolean(woo), href: "#woocommerce" },
    { name: `Google Sheets (${sheets.length})`, on: sheets.length > 0, href: "#sheets" },
    { name: `API keys (${keys.n})`, on: keys.n > 0, href: "/settings/developers" },
    { name: `Webhooks (${hooks.n})`, on: hooks.n > 0, href: "/settings/developers" },
  ];
  return (
    <SettingsPage title="Connected apps" summary={connected ? `${connected} connected · ${synced.n} store orders synced` : "Nothing connected yet"} status={[{ label: "Connected", value: String(connected), tone: connected ? "on" : "off" }, { label: "Store orders synced", value: String(synced.n), tone: synced.n ? "on" : "off" }, { label: "Cart reminders sent", value: String(carts.n), tone: carts.n ? "on" : "off" }]} tips={["Send a test order after connecting a store.", "Store orders can trigger WhatsApp automations.", "Sheets sync needs the service account shared on the sheet."]}>
      <div className="space-y-3 empty:hidden">
        {sp.saved && sp.saved !== "sheets" && <Alert tone="success">Connected. Send a test order to check it.</Alert>}
      </div>
      {connected === 0 ? (
        <EmptyState icon={<Plug />} columns={["App", "Status"]} title="No apps connected" description="Connect your store, payments or a spreadsheet to bring orders and data into WhatsFlow." primary={{ label: "Browse apps", href: "#shopify" }} />
      ) : (
      <SettingsSection title="Overview" description={`${connected} connected. Orders from your store land in Orders and can trigger WhatsApp automations.`}>
        <div className="grid grid-cols-2 gap-2">
          {apps.map((a) => (
            <Link key={a.name} href={a.href} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm hover:bg-hover">
              {a.name}
              <Badge tone={a.on ? "success" : "neutral"}>{a.on ? "On" : "Off"}</Badge>
            </Link>
          ))}
          <p className="col-span-full text-xs text-muted">
            {synced.n} store orders synced · {carts.n} abandoned-cart reminders sent
          </p>
        </div>
      </SettingsSection>
      )}

        <SettingsSection id="shopify" title="Shopify" description="New and updated orders, and abandoned checkouts.">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In Shopify admin, open Settings → Notifications → Webhooks and create webhooks for <strong>Order creation</strong>, <strong>Order update</strong>, <strong>Checkout creation</strong> and <strong>Checkout update</strong>, format JSON, sent to:
              <code className="mt-1 block break-all rounded bg-surface-2 px-2 py-1 text-xs text-ink">{`${base}/api/webhooks/store/shopify/${org.id}`}</code>
            </li>
            <li>Copy the signing key Shopify shows under the webhook list and paste it below.</li>
          </ol>
          <SaveForm action={saveStore} success="Store saved" className="space-y-4">
            <input type="hidden" name="kind" value="shopify" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store address" htmlFor="shopUrl">
                <Input id="shopUrl" name="storeUrl" placeholder="your-store.myshopify.com" defaultValue={shopify?.storeUrl} required />
              </Field>
              <Field label="Webhook signing key" htmlFor="shopSecret">
                <Input id="shopSecret" name="webhookSecret" type="password" autoComplete="off" placeholder={shopify ? "Saved. Paste a new one to change it." : ""} required={!shopify} />
              </Field>
              <Field label="Count a checkout as abandoned after (minutes)" htmlFor="cartMinutes">
                <Input id="cartMinutes" name="cartMinutes" type="number" min={15} max={1440} defaultValue={shopify?.cartMinutes ?? 60} />
              </Field>
            </div>
            <Toggle
              name="cartConsentOnly"
              label="Only remind shoppers who agreed to marketing"
              description="Cart reminders are marketing messages, and Meta requires opt-in for those."
              defaultChecked={shopify?.cartConsentOnly ?? true}
            />
            <p className="text-xs text-muted">
              To message abandoned carts, create an automation on <em>A store checkout is abandoned</em> that sends an approved template with <code>cart_url</code>.
            </p>
            <SubmitButton>{shopify ? "Save changes" : "Connect Shopify"}</SubmitButton>
          </SaveForm>
          {shopify && (
            <SaveForm action={removeStore} success="Store disconnected">
              <input type="hidden" name="kind" value="shopify" />
              <SubmitButton size="sm" variant="ghost" className="text-danger">
                Disconnect Shopify
              </SubmitButton>
            </SaveForm>
          )}
        </SettingsSection>

        <SettingsSection id="woocommerce" title="WooCommerce" description="New and updated orders.">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In WordPress, open WooCommerce → Settings → Advanced → Webhooks and add two webhooks, <strong>Order created</strong> and <strong>Order updated</strong>, delivered to:
              <code className="mt-1 block break-all rounded bg-surface-2 px-2 py-1 text-xs text-ink">{`${base}/api/webhooks/store/woocommerce/${org.id}`}</code>
            </li>
            <li>Use the secret below as each webhook&apos;s Secret.</li>
          </ol>
          <SaveForm action={saveStore} success="Store saved" className="space-y-4">
            <input type="hidden" name="kind" value="woocommerce" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shop address" htmlFor="wooUrl">
                <Input id="wooUrl" name="storeUrl" placeholder="https://shop.example.com" defaultValue={woo?.storeUrl} required />
              </Field>
              <Field label="Webhook secret" htmlFor="wooSecret" hint={woo ? "Saved. Change it only if you change it in WooCommerce too." : "Generated for you. Copy it into WooCommerce before connecting; it isn't shown again."}>
                <Input id="wooSecret" name="webhookSecret" autoComplete="off" defaultValue={woo ? "" : randomToken(24)} placeholder={woo ? "Leave as is" : ""} required={!woo} />
              </Field>
            </div>
            <SubmitButton>{woo ? "Save changes" : "Connect WooCommerce"}</SubmitButton>
          </SaveForm>
          {woo && (
            <SaveForm action={removeStore} success="Store disconnected">
              <input type="hidden" name="kind" value="woocommerce" />
              <SubmitButton size="sm" variant="ghost" className="text-danger">
                Disconnect WooCommerce
              </SubmitButton>
            </SaveForm>
          )}
        </SettingsSection>

        <SettingsSection id="sheets" title="Google Sheets" description="New leads, bookings, orders, enquiries or contacts are added as rows to your sheet within a minute.">
          {sp.saved === "sheets" && <Alert tone="success">Sheet connected. New rows appear within a minute.</Alert>}
          {!sa ? (
            <Alert tone="warning">Google Sheets needs a Google service account on this server: set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY.</Alert>
          ) : (
            <>
              {sheets.length > 0 && (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {sheets.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <div className="flex-1">
                        <div className="font-medium">
                          {SHEET_KINDS[s.kind].label} →{" "}
                          <a className="link" href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit`} target="_blank" rel="noreferrer noopener">
                            {s.tab}
                          </a>
                        </div>
                        <div className={s.lastError ? "text-danger" : "text-muted"}>
                          {s.lastError ?? `${s.rowsSynced} rows sent${s.lastSyncedAt ? ` · last ${timeAgo(s.lastSyncedAt)}` : ""}`}
                        </div>
                      </div>
                      <SaveForm action={syncSheetNow} success="Sync started">
                        <input type="hidden" name="kind" value={s.kind} />
                        <SubmitButton size="sm" variant="secondary">
                          Sync now
                        </SubmitButton>
                      </SaveForm>
                      <SaveForm action={removeSheet} success="Sheet disconnected">
                        <input type="hidden" name="kind" value={s.kind} />
                        <SubmitButton size="sm" variant="ghost" className="text-danger">
                          Stop
                        </SubmitButton>
                      </SaveForm>
                    </li>
                  ))}
                </ul>
              )}
              {unsynced.length > 0 && (
                <SaveForm action={connectSheet} success="Sheet connected" className="space-y-3">
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                    <li>
                      In your sheet, click Share and add <code className="rounded bg-surface-2 px-1 text-xs text-ink">{sa.email}</code> as an Editor.
                    </li>
                    <li>Paste the sheet&apos;s link and pick what to send. We add a tab for it with a header row.</li>
                  </ol>
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <Field label="Sheet link" htmlFor="sheet">
                      <Input id="sheet" name="sheet" required placeholder="https://docs.google.com/spreadsheets/d/…" />
                    </Field>
                    <Field label="Send" htmlFor="sheetKind">
                      <Select id="sheetKind" name="kind">
                        {unsynced.map((k) => (
                          <option key={k} value={k}>
                            {SHEET_KINDS[k].label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Tab name (optional)" htmlFor="tab" hint="Leave blank for a tab named like “WhatsFlow leads”.">
                    <Input id="tab" name="tab" maxLength={80} />
                  </Field>
                  <Toggle name="backfill" label="Also send everything from before today" />
                  <SubmitButton>Connect sheet</SubmitButton>
                </SaveForm>
              )}
            </>
          )}
        </SettingsSection>
    </SettingsPage>
  );
}
