import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { PROFILE_VERTICALS, providerFor, type HealthCheck } from "@/lib/wa";
import { timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { UploadField } from "@/components/upload-field";
import { disconnectNumber, fixSubscription, saveProfile } from "../actions";
import { ConnectForm } from "./connect-form";
import { EmbeddedSignup } from "./embedded-signup";

export const metadata: Metadata = { title: "WhatsApp numbers" };

export default async function Page({ searchParams }: { searchParams: Promise<{ n?: string; disconnected?: string; profileSaved?: string; profileError?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const numbers = await d.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, org.id));
  const current = numbers.find((n) => n.id === sp.n) ?? numbers.find((n) => n.provider === "cloud" && n.status !== "disconnected") ?? numbers[0];
  let checks: HealthCheck[] = [];
  if (current && current.status !== "disconnected") {
    try {
      checks = await providerFor(current).health();
    } catch (e) {
      checks = [{ id: "config", label: "Connection details", ok: false, detail: (e as Error).message }];
    }
    await d.update(schema.waNumbers).set({ lastCheckedAt: new Date() }).where(eq(schema.waNumbers.id, current.id));
  }
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <>
      <PageHeader title="WhatsApp numbers" description="Connect your number through Meta's official Cloud API. Your number and your Meta account stay yours." />
      <div className="grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {sp.disconnected && <Alert tone="success">Disconnected. We deleted the access token, so WhatsFlow can no longer send or read anything on that number. You can also remove our app in Meta Business Settings → Integrations.</Alert>}
          <Card>
            <ul className="divide-y divide-line">
              {numbers.map((n) => (
                <li key={n.id}>
                  <Link href={`/settings/whatsapp?n=${n.id}`} className={`flex items-center gap-3 px-5 py-4 hover:bg-surface-2 ${current?.id === n.id ? "bg-accent-soft" : ""}`}>
                    <div className="flex-1">
                      <div className="font-medium">
                        {n.displayPhone} <span className="text-muted">· {n.displayName}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {n.provider === "sandbox" ? "Sandbox: try everything without Meta" : `Cloud API · last event ${timeAgo(n.lastWebhookAt)}`}
                      </div>
                    </div>
                    {n.provider === "sandbox" && <Badge>sandbox</Badge>}
                    <StatusBadge status={n.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {current && current.status !== "disconnected" && (
            <Card className="p-5">
              <h2 className="font-semibold">Connection check · {current.displayPhone}</h2>
              <p className="mb-4 text-sm text-muted">Run live against Meta each time you open this page.</p>
              <ul className="space-y-3">
                {checks.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    {c.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={18} /> : <CircleAlert className="mt-0.5 shrink-0 text-danger" size={18} />}
                    <div className="text-sm">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-muted">{c.detail}</div>
                      {!c.ok && c.fix && <div className="mt-1 text-ink">How to fix: {c.fix}</div>}
                    </div>
                  </li>
                ))}
              </ul>
              {current.provider === "cloud" && (
                <>
                  <div className="mt-5 space-y-2 rounded-md bg-surface-2 p-4 text-sm">
                    <div className="font-medium">Webhook settings for your Meta app</div>
                    <div>
                      Callback URL: <code className="break-all">{base}/api/webhooks/whatsapp</code>
                    </div>
                    <div>
                      Verify token: <code className="break-all">{current.verifyToken}</code>
                    </div>
                    <div className="text-muted">Subscribe to the “messages” field.</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {checks.some((c) => c.id === "subscribed" && !c.ok) && (
                      <form action={fixSubscription}>
                        <input type="hidden" name="id" value={current.id} />
                        <Button variant="secondary">Fix subscription</Button>
                      </form>
                    )}
                    <form action={disconnectNumber}>
                      <input type="hidden" name="id" value={current.id} />
                      <Button variant="ghost" className="text-danger">
                        Disconnect and delete token
                      </Button>
                    </form>
                  </div>
                </>
              )}
            </Card>
          )}

          {current && current.status !== "disconnected" && (
            <Card id="profile" className="p-5">
              <h2 className="font-semibold">Business profile · {current.displayPhone}</h2>
              <p className="mb-4 text-sm text-muted">What customers see when they tap your name in WhatsApp.{current.provider === "sandbox" ? " Sandbox numbers just save it here." : ""}</p>
              {sp.profileSaved && <Alert tone="success">Profile updated.</Alert>}
              {sp.profileError && <Alert tone="danger">{sp.profileError}</Alert>}
              <form action={saveProfile} className="mt-3 space-y-4">
                <input type="hidden" name="id" value={current.id} />
                <Field label="About" htmlFor="about" hint="Up to 139 characters, shown under your name.">
                  <Input id="about" name="about" maxLength={139} defaultValue={current.profile.about ?? ""} required />
                </Field>
                <Field label="Description" htmlFor="description">
                  <Textarea id="description" name="description" maxLength={512} rows={3} defaultValue={current.profile.description ?? ""} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Address" htmlFor="address">
                    <Input id="address" name="address" maxLength={256} defaultValue={current.profile.address ?? ""} />
                  </Field>
                  <Field label="Category" htmlFor="vertical">
                    <Select id="vertical" name="vertical" defaultValue={current.profile.vertical ?? "OTHER"}>
                      {Object.entries(PROFILE_VERTICALS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Email" htmlFor="pemail">
                    <Input id="pemail" name="email" type="email" maxLength={128} defaultValue={current.profile.email ?? ""} />
                  </Field>
                  <Field label="Website" htmlFor="website">
                    <Input id="website" name="website" maxLength={256} placeholder="https://" defaultValue={current.profile.website ?? ""} />
                  </Field>
                </div>
                <UploadField name="photoUrl" label="Profile photo (square JPG or PNG, optional)" accept="image/jpeg,image/png" defaultValue={current.profile.photoUrl ?? ""} />
                <Button>Save profile</Button>
              </form>
            </Card>
          )}
        </div>
        <Card className="h-fit p-5">
          <h2 className="font-semibold">Connect a real number</h2>
          {process.env.META_APP_ID && process.env.META_ES_CONFIG_ID && (
            <div className="mt-3 border-b border-line pb-4">
              <EmbeddedSignup appId={process.env.META_APP_ID} configId={process.env.META_ES_CONFIG_ID} version={process.env.META_GRAPH_VERSION ?? "v23.0"} />
              <p className="mt-3 text-xs font-medium text-muted">Or connect by hand:</p>
            </div>
          )}
          <ol className="my-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In <a className="text-accent" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers</a>, create a Business app and add WhatsApp.
            </li>
            <li>Add and verify your phone number under WhatsApp → API Setup.</li>
            <li>In Business Settings → System users, create a permanent token with whatsapp_business_messaging and whatsapp_business_management.</li>
            <li>Paste the IDs and token here. We check them with Meta before saving.</li>
          </ol>
          <ConnectForm />
          <p className="mt-3 text-xs text-muted">The token is encrypted at rest and deleted when you disconnect.</p>
        </Card>
      </div>
    </>
  );
}
