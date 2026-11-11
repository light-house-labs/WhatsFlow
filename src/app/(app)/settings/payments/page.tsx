import { CreditCard } from "lucide-react";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { sandboxPaymentsAllowed } from "@/lib/payments";
import { Alert, Badge, EmptyState, Field, Input } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SettingsSection } from "@/components/settings";
import { removePaymentProvider, savePaymentProvider, saveReminder } from "./actions";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "Payments" };

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const rows = await d.select().from(schema.integrations).where(eq(schema.integrations.orgId, org.id));
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const providers = [
    {
      kind: "razorpay" as const,
      name: "Razorpay",
      blurb: "UPI, cards and netbanking in India. Creates Razorpay payment links.",
      fields: [
        ["keyId", "Key ID", "rzp_live_…"],
        ["keySecret", "Key secret", ""],
        ["webhookSecret", "Webhook secret", "The secret you set when adding the webhook below"],
      ],
      webhookHelp: "In the Razorpay dashboard → Webhooks, add this URL and tick the payment_link.paid event.",
    },
    {
      kind: "stripe" as const,
      name: "Stripe",
      blurb: "Cards and wallets worldwide. Creates Stripe Checkout links.",
      fields: [
        ["secretKey", "Secret key", "sk_live_… or a restricted key rk_live_…"],
        ["webhookSecret", "Webhook signing secret", "whsec_…"],
      ],
      webhookHelp: "In Stripe → Developers → Webhooks, add this URL and select checkout.session.completed.",
    },
  ];
  const hasRzp = rows.some((r) => r.kind === "razorpay");
  const hasStripe = rows.some((r) => r.kind === "stripe");
  return (
    <SettingsPage title="Payments" summary={rows.length ? `${rows.length} ${rows.length === 1 ? "provider" : "providers"} connected · reminders ${org.paymentReminderHours ? `after ${org.paymentReminderHours}h` : "off"}` : "No provider connected"} status={[{ label: "Razorpay", value: hasRzp ? "Connected" : "Not connected", tone: hasRzp ? "on" : "off" }, { label: "Stripe", value: hasStripe ? "Connected" : "Not connected", tone: hasStripe ? "on" : "off" }, { label: "Reminder", value: org.paymentReminderHours ? `After ${org.paymentReminderHours}h` : "Off", tone: org.paymentReminderHours ? "on" : "off" }]} tips={["Money goes straight to your own account.", "Add the webhook URL so paid links update orders.", "If both are connected, Razorpay is used."]}>
      <div className="space-y-3 empty:hidden">
        {sp.saved === "1" && <Alert tone="success">Connected. New payment links will use it.</Alert>}
      </div>
      <p className="text-sm text-muted">Send payment links in chat. Money goes straight to your own Razorpay or Stripe account; we never touch it.</p>
      {!rows.length && (
        <EmptyState
          icon={<CreditCard />}
          columns={["Provider", "Status"]}
          title="No payment provider connected"
          description="Connect Razorpay or Stripe to send payment links in chat. Money goes straight to your account."
          primary={{ label: "Connect payment provider", href: "#razorpay" }}
          hint={sandboxPaymentsAllowed() ? "Until then, payment links open a test checkout page where you can simulate a payment." : undefined}
        />
      )}
      {providers.map((p) => {
          const row = rows.find((r) => r.kind === p.kind);
          return (
            <SettingsSection key={p.kind} id={p.kind} title={p.name} description={p.blurb}>
              <div>{row ? <Badge tone="success">Connected · {row.label}</Badge> : <Badge>Not connected</Badge>}</div>
              <div className="rounded-lg border border-line p-3 text-xs">
                <div className="mb-1 text-muted">{p.webhookHelp}</div>
                <code className="break-all">{`${base}/api/webhooks/payments/${p.kind}/${org.id}`}</code>
              </div>
              <SaveForm action={savePaymentProvider} success="Payment provider saved" className="space-y-3">
                <input type="hidden" name="kind" value={p.kind} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {p.fields.map(([name, label, hint]) => (
                    <Field key={name} label={label} htmlFor={`${p.kind}-${name}`} hint={hint || undefined}>
                      <Input id={`${p.kind}-${name}`} name={name} type={name === "keyId" ? "text" : "password"} autoComplete="off" required />
                    </Field>
                  ))}
                </div>
                <div className="flex gap-2">
                  <SubmitButton size="sm">{row ? "Replace keys" : "Connect"}</SubmitButton>
                </div>
              </SaveForm>
              {row && (
                <SaveForm action={removePaymentProvider} success="Payment provider removed">
                  <input type="hidden" name="kind" value={p.kind} />
                  <SubmitButton size="sm" variant="ghost" className="text-danger">
                    Disconnect {p.name}
                  </SubmitButton>
                </SaveForm>
              )}
            </SettingsSection>
          );
        })}
        <SettingsSection title="Payment reminders" description="Keys are encrypted at rest. If both providers are connected, Razorpay is used." action={saveReminder}>
          <Field label="Remind unpaid customers after (hours)" htmlFor="reminderHours" hint="One reminder with the same link, sent in chat. 0 turns it off.">
            <Input id="reminderHours" name="hours" type="number" min={0} max={168} defaultValue={org.paymentReminderHours} className="w-32" />
          </Field>
        </SettingsSection>
    </SettingsPage>
  );
}
