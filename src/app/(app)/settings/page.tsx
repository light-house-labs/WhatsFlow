import type { Metadata } from "next";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { openingStatus } from "@/lib/hours";
import { FieldGrid, MessageField, SettingsSection, TimezoneSelect, Toggle } from "@/components/settings";
import { addQuickReply, deleteQuickReply, saveInboxSettings } from "./actions";
import { SaveForm, SubmitButton } from "@/components/save-form";

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

export default async function Page() {
  const { db: d, org, role } = await requireOrg();
  const [[s], replies] = await Promise.all([
    d.select().from(schema.inboxSettings).where(eq(schema.inboxSettings.orgId, org.id)),
    d.select().from(schema.quickReplies).where(eq(schema.quickReplies.orgId, org.id)).orderBy(asc(schema.quickReplies.shortcut)),
  ]);
  const admin = role !== "agent";
  const [wa] = await d.select({ n: count() }).from(schema.waNumbers).where(and(eq(schema.waNumbers.orgId, org.id), ne(schema.waNumbers.status, "disconnected")));
  const hours = openingStatus(s.businessHours, org.timezone);
  const auto = s.welcomeEnabled && s.awayEnabled ? "Welcome and away replies on" : s.welcomeEnabled ? "Welcome reply on" : s.awayEnabled ? "Away reply on" : "Auto-replies off";
  const autoOn = s.welcomeEnabled || s.awayEnabled;
  return (
    <SettingsPage title="Inbox" summary={`${auto} · ${hours.open ? "Open now" : "Closed"} · ${replies.length} quick ${replies.length === 1 ? "reply" : "replies"}`} status={[{ label: "Opening", value: hours.text, tone: hours.open ? "on" : "off" }, { label: "WhatsApp number", value: wa.n ? "Connected" : "Not connected", tone: wa.n ? "on" : "warn" }, { label: "Auto-replies", value: autoOn ? "On" : "Off", tone: autoOn ? "on" : "off" }]} tips={["Welcome goes out in opening hours, away goes out after them.", "Type / in the inbox to use a quick reply.", "Variables like {name} are filled in per customer."]}>
      {admin ? (
        <>
          <SettingsSection title="Business" description="Your business name and the time zone used for opening hours and reports." action={saveInboxSettings} section="business">
            <FieldGrid>
              <Field label="Business name" htmlFor="orgName">
                <Input id="orgName" name="orgName" defaultValue={org.name} />
              </Field>
              <Field label="Time zone" htmlFor="timezone">
                <TimezoneSelect id="timezone" name="timezone" defaultValue={org.timezone} />
              </Field>
            </FieldGrid>
          </SettingsSection>
          <SettingsSection title="Automatic replies" description="Sent when a new conversation starts and no bot flow picks it up." action={saveInboxSettings} section="replies" hint="Variables are filled in per customer.">
            <Toggle name="welcomeEnabled" label="Welcome message" description="Sent during opening hours." defaultChecked={s.welcomeEnabled}>
              <MessageField name="welcomeMessage" label="Message" defaultValue={s.welcomeMessage} business={org.name} />
            </Toggle>
            <Toggle name="awayEnabled" label="Away message" description="Sent outside opening hours." defaultChecked={s.awayEnabled}>
              <MessageField name="awayMessage" label="Message" defaultValue={s.awayMessage} business={org.name} />
            </Toggle>
          </SettingsSection>
          <SettingsSection title="Opening hours" description="Days you are open. Closed days get the away message." action={saveInboxSettings} section="hours">
            <div className="space-y-3">
              {DAYS.map(([k, label]) => {
                const h = s.businessHours[k];
                return (
                  <Toggle key={k} inline name={`${k}_on`} label={label} defaultChecked={Boolean(h)}>
                    <Input type="time" name={`${k}_open`} aria-label={`${label} opens`} defaultValue={h?.open ?? "09:00"} className="w-32" />
                    <span className="text-sm text-muted">to</span>
                    <Input type="time" name={`${k}_close`} aria-label={`${label} closes`} defaultValue={h?.close ?? "18:00"} className="w-32" />
                  </Toggle>
                );
              })}
            </div>
          </SettingsSection>
          <SettingsSection title="Alerts and opt-out" description="When to flag a waiting customer, and which words stop marketing messages." action={saveInboxSettings} section="alerts">
            <Field label="Alert when a customer waits longer than (minutes)" htmlFor="wait">
              <Input id="wait" name="waitAlertMinutes" type="number" min={1} max={1440} defaultValue={s.waitAlertMinutes} className="w-32" />
            </Field>
            <Field label="Opt-out keywords" htmlFor="optout" hint="A customer who sends one of these stops getting marketing messages. Comma separated.">
              <Input id="optout" name="optOutKeywords" defaultValue={s.optOutKeywords.join(", ")} />
            </Field>
          </SettingsSection>
        </>
      ) : (
        <Alert tone="accent">Only owners and admins can change automatic replies and hours. You can manage quick replies below.</Alert>
      )}
      <SettingsSection title="Quick replies" description="Type / in the inbox to use them.">
        {replies.length > 0 && (
          <ul className="divide-y divide-line">
            {replies.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2 text-sm first:pt-0">
                <span className="w-28 shrink-0">/{r.shortcut}</span>
                <span className="flex-1 whitespace-pre-wrap text-muted">{r.body}</span>
                <SaveForm action={deleteQuickReply} success="Quick reply deleted">
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="ghost">
                    Delete
                  </SubmitButton>
                </SaveForm>
              </li>
            ))}
          </ul>
        )}
        <SaveForm action={addQuickReply} success="Quick reply added" resetOnSuccess className="flex flex-wrap items-start gap-2">
          <Input name="shortcut" placeholder="shortcut" aria-label="Shortcut" className="w-36" required />
          <Textarea name="body" placeholder="Message" aria-label="Quick reply message" className="min-h-9 flex-1 resize-none" required />
          <SubmitButton variant="secondary">Add</SubmitButton>
        </SaveForm>
      </SettingsSection>
    </SettingsPage>
  );
}
