import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { sandboxPaymentsAllowed } from "@/lib/payments";
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { removePaymentProvider, savePaymentProvider } from "./actions";

export const metadata: Metadata = { title: "Payments" };

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
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
  return (
    <>
      <PageHeader title="Payments" description="Send payment links in chat. Money goes straight to your own Razorpay or Stripe account; we never touch it." />
      <div className="max-w-3xl space-y-6 p-6">
        {sp.saved && <Alert tone="success">Connected. New payment links will use it.</Alert>}
        {sp.error === "razorpay" && <Alert tone="danger">Check the Razorpay key ID (starts rzp_live_ or rzp_test_), key secret and webhook secret.</Alert>}
        {sp.error === "stripe" && <Alert tone="danger">Check the Stripe secret key (sk_ or rk_) and webhook signing secret (whsec_).</Alert>}
        {!rows.length && (
          <Alert tone="accent">
            {sandboxPaymentsAllowed()
              ? "No provider connected: payment links open a test checkout page where you can simulate a payment."
              : "Connect a provider to send payment links."}
          </Alert>
        )}
        {providers.map((p) => {
          const row = rows.find((r) => r.kind === p.kind);
          return (
            <Card key={p.kind} className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-sm text-muted">{p.blurb}</p>
                </div>
                {row ? <Badge tone="success">Connected · {row.label}</Badge> : <Badge>Not connected</Badge>}
              </div>
              <div className="rounded-md bg-surface-2 p-3 text-xs">
                <div className="mb-1 text-muted">{p.webhookHelp}</div>
                <code className="break-all">{`${base}/api/webhooks/payments/${p.kind}/${org.id}`}</code>
              </div>
              <form action={savePaymentProvider} className="space-y-3">
                <input type="hidden" name="kind" value={p.kind} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {p.fields.map(([name, label, hint]) => (
                    <Field key={name} label={label} htmlFor={`${p.kind}-${name}`} hint={hint || undefined}>
                      <Input id={`${p.kind}-${name}`} name={name} type={name === "keyId" ? "text" : "password"} autoComplete="off" required />
                    </Field>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm">{row ? "Replace keys" : "Connect"}</Button>
                </div>
              </form>
              {row && (
                <form action={removePaymentProvider}>
                  <input type="hidden" name="kind" value={p.kind} />
                  <Button size="sm" variant="ghost" className="text-danger">
                    Disconnect {p.name}
                  </Button>
                </form>
              )}
            </Card>
          );
        })}
        <p className="text-xs text-muted">Keys are encrypted at rest. If both are connected, Razorpay is used.</p>
      </div>
    </>
  );
}
