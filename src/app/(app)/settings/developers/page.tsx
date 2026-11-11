import { KeyRound, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { WEBHOOK_EVENTS } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { dateTime, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, EmptyState, Field, Input, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SettingsSection } from "@/components/settings";
import { addWebhook, createApiKey, deleteWebhook, retryDelivery, revokeApiKey, sendTestWebhook, toggleWebhook } from "./actions";

export const metadata: Metadata = { title: "Developers" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; tested?: string; failed?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const flashRaw = (await cookies()).get("wf_flash_secret")?.value;
  const flash = flashRaw ? (JSON.parse(flashRaw) as { label: string; value: string }) : null;
  const r = schema.apiRequests;
  const [keys, hooks, deliveries, requests, [usage]] = await Promise.all([
    d.select().from(schema.apiKeys).where(eq(schema.apiKeys.orgId, org.id)).orderBy(desc(schema.apiKeys.createdAt)),
    d.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.orgId, org.id)).orderBy(desc(schema.webhookEndpoints.createdAt)),
    d
      .select({ del: schema.webhookDeliveries, url: schema.webhookEndpoints.url })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhookEndpoints, eq(schema.webhookEndpoints.id, schema.webhookDeliveries.endpointId))
      .where(eq(schema.webhookDeliveries.orgId, org.id))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(30),
    d
      .select({ r, key: schema.apiKeys.name })
      .from(r)
      .leftJoin(schema.apiKeys, eq(schema.apiKeys.id, r.keyId))
      .where(and(eq(r.orgId, org.id), sp.failed ? sql`${r.status} >= 400` : undefined))
      .orderBy(desc(r.createdAt))
      .limit(50),
    d
      .select({
        total: sql<number>`count(*)`,
        failed: sql<number>`count(*) filter (where ${r.status} >= 400)`,
        limited: sql<number>`count(*) filter (where ${r.status} = 429)`,
        p95: sql<number | null>`percentile_cont(0.95) within group (order by ${r.durationMs})`,
      })
      .from(r)
      .where(and(eq(r.orgId, org.id), sql`${r.createdAt} > now() - interval '24 hours'`)),
  ]);
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const liveKeys = keys.filter((k) => !k.revokedAt).length;
  const liveHooks = hooks.filter((h) => h.active).length;
  const reqs = Number(usage?.total ?? 0);
  const failed = Number(usage?.failed ?? 0);
  return (
    <SettingsPage title="API & webhooks" summary={`${liveKeys} active ${liveKeys === 1 ? "key" : "keys"} · ${liveHooks} active ${liveHooks === 1 ? "webhook" : "webhooks"} · ${reqs} requests in 24h`} status={[{ label: "API keys", value: String(liveKeys), tone: liveKeys ? "on" : "off" }, { label: "Webhooks", value: String(liveHooks), tone: liveHooks ? "on" : "off" }, { label: "Failed (24h)", value: `${failed} of ${reqs}`, tone: failed ? "warn" : "off" }]} tips={["A new key or secret is shown once; copy it straight away.", "Use Test on a webhook to queue a sample delivery.", "Filter the request log to failures to debug."]}>
      <div className="space-y-3 empty:hidden">
        {flash && (
          <Alert tone="success">
            <div className="font-medium">{flash.label}: copy it now. It won&apos;t be shown again.</div>
            <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{flash.value}</code>
          </Alert>
        )}
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        {sp.tested && <Alert tone="accent">Test delivery queued. It appears in the log below.</Alert>}
      </div>

        <SettingsSection
          id="api-keys"
          title="API keys"
          description={
            <>
              Connect WhatsFlow to your own systems with the REST API and webhooks. Send <code>Authorization: Bearer &lt;key&gt;</code> to <code>{base}/api/v1</code>. Endpoints: <code>GET/POST /contacts</code>, <code>GET/PATCH /contacts/:id</code>,{" "}
              <code>GET /conversations</code>, <code>GET /conversations/:id/messages</code>, <code>POST /messages</code>, <code>GET /messages/:id</code>, <code>GET /orders</code>.
            </>
          }
        >
          {keys.length === 0 && (
            <EmptyState
              icon={<KeyRound />}
              columns={["Name", "Key", "Access", "Last used", ""]}
              title="No API keys yet"
              description="Use an API key to read and send from your own systems."
              primary={{ label: "Create API key", href: "#kname" }}
            />
          )}
          {keys.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Key</Th>
                  <Th>Access</Th>
                  <Th>Last used</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <Td className="font-medium">{k.name}</Td>
                    <Td>
                      <code className="text-xs">{k.prefix}…</code>
                    </Td>
                    <Td>{k.scope === "read" ? "Read only" : "Full"}</Td>
                    <Td className="text-muted">{k.revokedAt ? "Revoked" : k.lastUsedAt ? timeAgo(k.lastUsedAt) : "Never"}</Td>
                    <Td className="text-right">
                      {!k.revokedAt && (
                        <form action={revokeApiKey}>
                          <input type="hidden" name="id" value={k.id} />
                          <Button size="sm" variant="ghost" className="text-danger">
                            Revoke
                          </Button>
                        </form>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <form action={createApiKey} className="flex flex-wrap items-end gap-2">
            <Field label="Key name" htmlFor="kname">
              <Input id="kname" name="name" placeholder="Zapier, my CRM…" className="w-56" />
            </Field>
            <Field label="Access" htmlFor="kscope">
              <Select id="kscope" name="scope" className="w-40">
                <option value="full">Full</option>
                <option value="read">Read only</option>
              </Select>
            </Field>
            <Button>Create key</Button>
          </form>
        </SettingsSection>

        <SettingsSection
          id="webhooks"
          title="Webhooks"
          description={
            <>
              We POST JSON to your URL. Verify <code>X-WhatsFlow-Signature</code>: <code>sha256=</code> HMAC-SHA256 of <code>{"{X-WhatsFlow-Timestamp}.{body}"}</code> with your signing secret. Failed deliveries are retried 6 times with backoff.
            </>
          }
        >
          {hooks.length === 0 && (
            <EmptyState
              icon={<Webhook />}
              columns={["Endpoint", "Events", "Status", ""]}
              title="No webhooks yet"
              description="Add a webhook to get events pushed to your own URL."
              primary={{ label: "Add webhook", href: "#wurl" }}
            />
          )}
          {hooks.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3 text-sm">
              <code className="min-w-0 flex-1 break-all">{h.url}</code>
              {h.active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>}
              <div className="w-full text-xs text-muted">{h.events.join(", ")}</div>
              <div className="flex gap-1">
                <form action={sendTestWebhook}>
                  <input type="hidden" name="id" value={h.id} />
                  <Button size="sm" variant="secondary">Send test</Button>
                </form>
                <form action={toggleWebhook}>
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="active" value={h.active ? "0" : "1"} />
                  <Button size="sm" variant="ghost">{h.active ? "Pause" : "Resume"}</Button>
                </form>
                <form action={deleteWebhook}>
                  <input type="hidden" name="id" value={h.id} />
                  <Button size="sm" variant="ghost" className="text-danger">Delete</Button>
                </form>
              </div>
            </div>
          ))}
          <form action={addWebhook} className="space-y-3">
            <Field label="Endpoint URL" htmlFor="wurl">
              <Input id="wurl" name="url" type="url" placeholder="https://example.com/whatsflow" required />
            </Field>
            <fieldset className="grid gap-1 sm:grid-cols-3">
              <legend className="section-label mb-1 text-faint">Events</legend>
              {WEBHOOK_EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`ev_${e}`} defaultChecked={e !== "message.status"} /> <code className="text-xs">{e}</code>
                </label>
              ))}
            </fieldset>
            <Button size="sm">Add webhook</Button>
          </form>
        </SettingsSection>

        <SettingsSection title="API requests">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-sm text-muted">
              Last 24 hours: {Number(usage.total)} calls · {Number(usage.failed)} failed{Number(usage.limited) ? ` (${Number(usage.limited)} rate limited)` : ""}
              {usage.p95 != null && ` · 95% answered within ${Math.round(Number(usage.p95))} ms`}
            </span>
            <a href={sp.failed ? "/settings/developers" : "/settings/developers?failed=1"} className="ml-auto text-sm link">
              {sp.failed ? "Show all" : "Only failures"}
            </a>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-muted">{sp.failed ? "No failed calls in the last 30 days." : "Calls made with your API keys show up here for 30 days."}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Request</Th>
                  <Th>Result</Th>
                  <Th>Time</Th>
                  <Th>Key</Th>
                </tr>
              </thead>
              <tbody>
                {requests.map(({ r: q, key }) => (
                  <tr key={q.id}>
                    <Td className="text-muted">{timeAgo(q.createdAt)}</Td>
                    <Td>
                      <code className="text-xs">
                        {q.method} {q.path}
                      </code>
                    </Td>
                    <Td>
                      <Badge tone={q.status >= 500 ? "danger" : q.status >= 400 ? "warning" : "success"}>{q.status}</Badge>
                      {q.error && <span className="ml-2 text-xs text-muted">{q.error}</span>}
                    </Td>
                    <Td className="text-muted">{q.durationMs} ms</Td>
                    <Td className="text-muted">{key ?? "deleted key"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </SettingsSection>
        <SettingsSection title="Recent deliveries">
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted">Nothing sent yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Endpoint</Th>
                  <Th>Result</Th>
                  <Th>Tries</Th>
                  <Th>When</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {deliveries.map(({ del, url }) => (
                  <tr key={del.id}>
                    <Td>
                      <code className="text-xs">{del.event}</code>
                    </Td>
                    <Td className="max-w-48 truncate text-muted">{new URL(url).host}</Td>
                    <Td>
                      <StatusBadge status={del.status} /> <span className="text-xs text-muted">{del.responseCode ?? del.error ?? ""}</span>
                    </Td>
                    <Td>{del.attempts}</Td>
                    <Td className="text-muted">{dateTime(del.createdAt, org.timezone)}</Td>
                    <Td>
                      {del.status === "failed" && (
                        <form action={retryDelivery}>
                          <input type="hidden" name="id" value={del.id} />
                          <Button size="sm" variant="ghost">Retry</Button>
                        </form>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </SettingsSection>
    </SettingsPage>
  );
}
