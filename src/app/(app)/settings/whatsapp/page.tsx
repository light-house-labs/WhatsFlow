import { Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { PROFILE_VERTICALS, providerFor, type HealthCheck } from "@/lib/wa";
import { timeAgo } from "@/lib/format";
import { Alert, Badge, Button, EmptyState, Field, Input, Select, StatusBadge } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { MessageField, SettingsSection } from "@/components/settings";
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
  const live = numbers.filter((n) => n.status !== "disconnected").length;
  const passing = checks.filter((c) => c.ok).length;
  return (
    <SettingsPage title="WhatsApp numbers" summary={numbers.length ? `${live} of ${numbers.length} ${numbers.length === 1 ? "number" : "numbers"} connected${current ? ` · viewing ${current.displayPhone}` : ""}` : "No numbers connected"} status={[{ label: "Numbers connected", value: `${live} of ${numbers.length}`, tone: live ? "on" : "warn" }, { label: "Connection checks", value: checks.length ? `${passing} of ${checks.length} passing` : "None run", tone: checks.length ? (passing < checks.length ? "warn" : "on") : "off" }, { label: "Provider", value: current ? (current.provider === "sandbox" ? "Sandbox" : "Cloud API") : "None", tone: current ? "on" : "off" }]} tips={["Connect through Meta's official Cloud API; the number stays yours.", "A failing check lists how to fix it.", "Disconnecting deletes the access token."]}>
      {sp.disconnected && (
        <Alert tone="success">Disconnected. We deleted the access token, so WhatsFlow can no longer send or read anything on that number. You can also remove our app in Meta Business Settings → Integrations.</Alert>
      )}
      {numbers.length === 0 ? (
        <EmptyState icon={<Phone />} columns={["Number", "Provider", "Status"]} title="No numbers connected" description="Connect a WhatsApp number to send and receive customer messages." primary={{ label: "Connect number", href: "#connect" }} />
      ) : (
      <SettingsSection title="Numbers" description="Connect your number through Meta's official Cloud API. Your number and your Meta account stay yours. Pick a number to see its connection check and business profile." flush>
            <ul className="divide-y divide-line">
              {numbers.map((n) => (
                <li key={n.id}>
                  <Link href={`/settings/whatsapp?n=${n.id}`} aria-current={current?.id === n.id ? "true" : undefined} className={`relative flex items-center gap-3 px-5 py-4 transition-colors duration-150 hover:bg-surface-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent ${current?.id === n.id ? "bg-surface-2 before:opacity-100" : "before:opacity-0"}`}>
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
      </SettingsSection>
      )}

          {current && current.status !== "disconnected" && (
            <SettingsSection title={`Connection check · ${current.displayPhone}`} description="Run live against Meta each time you open this page.">
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
                  <div className="mt-5 space-y-2 rounded-lg border border-line p-4 text-sm">
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
            </SettingsSection>
          )}

          {current && current.status !== "disconnected" && (
            <SettingsSection
              id="profile"
              title={`Business profile · ${current.displayPhone}`}
              description={`What customers see when they tap your name in WhatsApp.${current.provider === "sandbox" ? " Sandbox numbers just save it here." : ""}`}
              action={saveProfile}
              fields={{ id: current.id }}
            >
              {sp.profileSaved && <Alert tone="success">Profile updated.</Alert>}
              {sp.profileError && <Alert tone="danger">{sp.profileError}</Alert>}
              <>
                <Field label="About" htmlFor="about" hint="Up to 139 characters, shown under your name.">
                  <Input id="about" name="about" maxLength={139} defaultValue={current.profile.about ?? ""} required />
                </Field>
                <MessageField name="description" label="Description" max={512} variables={[]} bubble={false} defaultValue={current.profile.description ?? ""} />
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
              </>
            </SettingsSection>
          )}
        <SettingsSection id="connect" title="Connect a real number" description="Use Meta's official Cloud API. The token is encrypted at rest and deleted when you disconnect.">
          {process.env.META_APP_ID && process.env.META_ES_CONFIG_ID && (
            <div className="mt-3 border-b border-line pb-4">
              <EmbeddedSignup appId={process.env.META_APP_ID} configId={process.env.META_ES_CONFIG_ID} version={process.env.META_GRAPH_VERSION ?? "v23.0"} />
              <p className="section-label mt-4 text-faint">Or connect by hand:</p>
            </div>
          )}
          <ol className="my-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In <a className="link" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers</a>, create a Business app and add WhatsApp.
            </li>
            <li>Add and verify your phone number under WhatsApp → API Setup.</li>
            <li>In Business Settings → System users, create a permanent token with whatsapp_business_messaging and whatsapp_business_management.</li>
            <li>Paste the IDs and token here. We check them with Meta before saving.</li>
          </ol>
          <ConnectForm />
        </SettingsSection>
    </SettingsPage>
  );
}
