import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { addQuickReply, deleteQuickReply, saveInboxSettings } from "./actions";

export const metadata: Metadata = { title: "Inbox settings" };

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  const [[s], replies] = await Promise.all([
    d.select().from(schema.inboxSettings).where(eq(schema.inboxSettings.orgId, org.id)),
    d.select().from(schema.quickReplies).where(eq(schema.quickReplies.orgId, org.id)).orderBy(asc(schema.quickReplies.shortcut)),
  ]);
  const admin = role !== "agent";
  return (
    <>
      <PageHeader title="Inbox settings" description="Automatic replies, opening hours, alerts and quick replies." />
      <div className="max-w-4xl space-y-6 p-6">
        {sp.saved && <Alert tone="success">Saved.</Alert>}
        {sp.error === "tz" && <Alert tone="danger">That time zone isn&apos;t recognised. Use a name like Asia/Kolkata.</Alert>}
        {admin ? (
          <form action={saveInboxSettings} className="space-y-6">
            <Card className="space-y-4 p-5">
              <h2 className="font-semibold">Business</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name" htmlFor="orgName">
                  <Input id="orgName" name="orgName" defaultValue={org.name} />
                </Field>
                <Field label="Time zone" htmlFor="timezone" hint="Used for opening hours and reports.">
                  <Input id="timezone" name="timezone" defaultValue={org.timezone} />
                </Field>
              </div>
            </Card>
            <Card className="space-y-4 p-5">
              <h2 className="font-semibold">Automatic replies</h2>
              <p className="text-sm text-muted">Sent when a new conversation starts and no bot flow picks it up.</p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="welcomeEnabled" defaultChecked={s.welcomeEnabled} /> Welcome message during opening hours
              </label>
              <Textarea name="welcomeMessage" aria-label="Welcome message" defaultValue={s.welcomeMessage} />
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="awayEnabled" defaultChecked={s.awayEnabled} /> Away message outside opening hours
              </label>
              <Textarea name="awayMessage" aria-label="Away message" defaultValue={s.awayMessage} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Opening hours</h2>
              <div className="space-y-2">
                {DAYS.map(([k, label]) => {
                  const h = s.businessHours[k];
                  return (
                    <div key={k} className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex w-32 items-center gap-2">
                        <input type="checkbox" name={`${k}_on`} defaultChecked={Boolean(h)} /> {label}
                      </label>
                      <Input type="time" name={`${k}_open`} aria-label={`${label} opens`} defaultValue={h?.open ?? "09:00"} className="w-32" />
                      <span className="text-muted">to</span>
                      <Input type="time" name={`${k}_close`} aria-label={`${label} closes`} defaultValue={h?.close ?? "18:00"} className="w-32" />
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Alert when a customer waits longer than (minutes)" htmlFor="wait">
                <Input id="wait" name="waitAlertMinutes" type="number" min={1} max={1440} defaultValue={s.waitAlertMinutes} />
              </Field>
              <Field label="Opt-out keywords" htmlFor="optout" hint="A customer who sends one of these stops getting marketing messages.">
                <Input id="optout" name="optOutKeywords" defaultValue={s.optOutKeywords.join(", ")} />
              </Field>
            </Card>
            <Button>Save settings</Button>
          </form>
        ) : (
          <Alert tone="accent">Only owners and admins can change automatic replies and hours. You can manage quick replies below.</Alert>
        )}
        <Card className="p-5">
          <h2 className="font-semibold">Quick replies</h2>
          <p className="mb-3 text-sm text-muted">Type / in the inbox to use them.</p>
          <ul className="mb-4 divide-y divide-line">
            {replies.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
                <span className="w-28 shrink-0 font-mono">/{r.shortcut}</span>
                <span className="flex-1 whitespace-pre-wrap text-muted">{r.body}</span>
                <form action={deleteQuickReply}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button size="sm" variant="ghost">
                    Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addQuickReply} className="flex flex-wrap items-start gap-2">
            <Input name="shortcut" placeholder="shortcut" aria-label="Shortcut" className="w-36" required />
            <Textarea name="body" placeholder="Message" aria-label="Quick reply message" className="min-h-10 flex-1" required />
            <Button variant="secondary">Add</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
