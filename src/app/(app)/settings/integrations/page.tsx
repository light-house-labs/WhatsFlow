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
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { connectSheet, removeSheet, removeStore, saveStore, syncSheetNow } from "./actions";

export const metadata: Metadata = { title: "Connected apps" };

const ERRORS: Record<string, string> = {
  shopify: "Enter your store's .myshopify.com address, e.g. sunrise-books.myshopify.com.",
  woocommerce: "Enter your shop's full https:// address.",
  "shopify-secret": "Paste the webhook signing key from Shopify (at least 16 characters).",
  "woocommerce-secret": "Use a secret of at least 16 characters, and the same one in WooCommerce.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; sheetError?: string }> }) {
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
    <>
      <PageHeader title="Connected apps" description={`${connected} connected. Orders from your store land in Orders and can trigger WhatsApp automations.`} />
      <div className="max-w-3xl space-y-6 p-6">
        {sp.saved && sp.saved !== "sheets" && <Alert tone="success">Connected. Send a test order to check it.</Alert>}
        {sp.error && ERRORS[sp.error] && <Alert tone="danger">{ERRORS[sp.error]}</Alert>}
        <Card className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {apps.map((a) => (
            <Link key={a.name} href={a.href} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-2">
              {a.name}
              <Badge tone={a.on ? "success" : "neutral"}>{a.on ? "On" : "Off"}</Badge>
            </Link>
          ))}
          <p className="col-span-full text-xs text-muted">
            {synced.n} store orders synced · {carts.n} abandoned-cart reminders sent
          </p>
        </Card>

        <Card id="shopify" className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Shopify</h2>
              <p className="text-sm text-muted">New and updated orders, and abandoned checkouts.</p>
            </div>
            {shopify && (
              <form action={removeStore}>
                <input type="hidden" name="kind" value="shopify" />
                <Button size="sm" variant="ghost" className="text-danger">
                  Disconnect
                </Button>
              </form>
            )}
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In Shopify admin, open Settings → Notifications → Webhooks and create webhooks for <strong>Order creation</strong>, <strong>Order update</strong>, <strong>Checkout creation</strong> and <strong>Checkout update</strong>, format JSON, sent to:
              <code className="mt-1 block break-all rounded bg-surface-2 px-2 py-1 text-xs text-ink">{`${base}/api/webhooks/store/shopify/${org.id}`}</code>
            </li>
            <li>Copy the signing key Shopify shows under the webhook list and paste it below.</li>
          </ol>
          <form action={saveStore} className="space-y-4">
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
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="cartConsentOnly" defaultChecked={shopify?.cartConsentOnly ?? true} className="mt-0.5" />
              <span>
                Only remind shoppers who agreed to marketing at checkout. Cart reminders are marketing messages, and Meta requires opt-in for those.
              </span>
            </label>
            <p className="text-xs text-muted">
              To message abandoned carts, create an automation on <em>A store checkout is abandoned</em> that sends an approved template with <code>cart_url</code>.
            </p>
            <Button>{shopify ? "Save changes" : "Connect Shopify"}</Button>
          </form>
        </Card>

        <Card id="woocommerce" className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">WooCommerce</h2>
              <p className="text-sm text-muted">New and updated orders.</p>
            </div>
            {woo && (
              <form action={removeStore}>
                <input type="hidden" name="kind" value="woocommerce" />
                <Button size="sm" variant="ghost" className="text-danger">
                  Disconnect
                </Button>
              </form>
            )}
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In WordPress, open WooCommerce → Settings → Advanced → Webhooks and add two webhooks, <strong>Order created</strong> and <strong>Order updated</strong>, delivered to:
              <code className="mt-1 block break-all rounded bg-surface-2 px-2 py-1 text-xs text-ink">{`${base}/api/webhooks/store/woocommerce/${org.id}`}</code>
            </li>
            <li>Use the secret below as each webhook&apos;s Secret.</li>
          </ol>
          <form action={saveStore} className="space-y-4">
            <input type="hidden" name="kind" value="woocommerce" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shop address" htmlFor="wooUrl">
                <Input id="wooUrl" name="storeUrl" placeholder="https://shop.example.com" defaultValue={woo?.storeUrl} required />
              </Field>
              <Field label="Webhook secret" htmlFor="wooSecret" hint={woo ? "Saved. Change it only if you change it in WooCommerce too." : "Generated for you. Copy it into WooCommerce before connecting; it isn't shown again."}>
                <Input id="wooSecret" name="webhookSecret" autoComplete="off" defaultValue={woo ? "" : randomToken(24)} placeholder={woo ? "Leave as is" : ""} required={!woo} />
              </Field>
            </div>
            <Button>{woo ? "Save changes" : "Connect WooCommerce"}</Button>
          </form>
        </Card>

        <Card id="sheets" className="space-y-4 p-5">
          <div>
            <h2 className="font-semibold">Google Sheets</h2>
            <p className="text-sm text-muted">New leads, bookings, orders, enquiries or contacts are added as rows to your sheet within a minute.</p>
          </div>
          {sp.saved === "sheets" && <Alert tone="success">Sheet connected. New rows appear within a minute.</Alert>}
          {sp.sheetError && <Alert tone="danger">{sp.sheetError}</Alert>}
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
                          <a className="text-accent" href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit`} target="_blank" rel="noreferrer noopener">
                            {s.tab}
                          </a>
                        </div>
                        <div className={s.lastError ? "text-danger" : "text-muted"}>
                          {s.lastError ?? `${s.rowsSynced} rows sent${s.lastSyncedAt ? ` · last ${timeAgo(s.lastSyncedAt)}` : ""}`}
                        </div>
                      </div>
                      <form action={syncSheetNow}>
                        <input type="hidden" name="kind" value={s.kind} />
                        <Button size="sm" variant="secondary">
                          Sync now
                        </Button>
                      </form>
                      <form action={removeSheet}>
                        <input type="hidden" name="kind" value={s.kind} />
                        <Button size="sm" variant="ghost" className="text-danger">
                          Stop
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              {unsynced.length > 0 && (
                <form action={connectSheet} className="space-y-3">
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
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="backfill" /> Also send everything from before today
                  </label>
                  <Button>Connect sheet</Button>
                </form>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
