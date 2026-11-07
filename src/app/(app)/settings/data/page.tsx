import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { Alert, Button, ButtonLink, Card, Field, Input, PageHeader } from "@/components/ui";
import { deleteWorkspace } from "./actions";

export const metadata: Metadata = { title: "Your data" };

const EXPORTS = [
  ["contacts", "Contacts", "Phone, name, email, tags, custom fields, opt-out"],
  ["messages", "Conversations", "Every message with direction, status and time"],
  ["leads", "Pipeline", "Leads with stage, value and owner"],
  ["tickets", "Tickets", "Number, subject, status, priority, dates"],
  ["orders", "Orders", "Items, totals, payment and delivery status"],
  ["appointments", "Appointments", "Service, time, status, customer"],
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { org, role } = await requireOrg("admin");
  return (
    <>
      <PageHeader title="Your data" description="Everything you put in is yours. Download it any time, and leave whenever you like." />
      <div className="max-w-3xl space-y-6 p-6">
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Export</h2>
          <ul className="divide-y divide-line">
            {EXPORTS.map(([kind, label, hint]) => (
              <li key={kind} className="flex items-center gap-4 py-2 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{label}</div>
                  <div className="text-muted">{hint}</div>
                </div>
                <ButtonLink href={`/api/export?kind=${kind}`} size="sm" variant="secondary" prefetch={false}>
                  CSV
                </ButtonLink>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-4">
            <ButtonLink href="/api/export?kind=all" prefetch={false}>
              Download everything (JSON)
            </ButtonLink>
          </div>
        </Card>
        {role === "owner" && (
          <Card className="space-y-3 border-danger/40 p-5">
            <h2 className="font-semibold text-danger">Delete this workspace</h2>
            <p className="text-sm text-muted">
              Disconnects your WhatsApp numbers (we delete our copy of the access token), cancels the plan with no further charges, and permanently deletes contacts, chats, orders and settings. Download your data first. This can&apos;t be undone.
            </p>
            <p className="text-sm text-muted">
              To also remove our access on Meta&apos;s side, open Meta Business Settings → Integrations → Connected apps and remove the app.
            </p>
            <form action={deleteWorkspace} className="flex flex-wrap items-end gap-2">
              <Field label={`Type “${org.name}” to confirm`} htmlFor="confirm">
                <Input id="confirm" name="confirm" autoComplete="off" className="w-72" />
              </Field>
              <Button variant="danger">Delete workspace</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
