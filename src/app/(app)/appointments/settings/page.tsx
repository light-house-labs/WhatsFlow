import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { bookingSettingsFor } from "@/lib/booking";
import { formatMoney, limitsFor } from "@/lib/plans";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { saveBookingSettings, saveService, toggleService } from "../actions";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "Services & hours" };

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
  const { db: d, org } = await requireOrg("admin");
  const s = await bookingSettingsFor(d, org.id);
  const [services, team, templates] = await Promise.all([
    d.select().from(schema.services).where(eq(schema.services.orgId, org.id)).orderBy(asc(schema.services.name)),
    d.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id)),
    d.select().from(schema.templates).where(and(eq(schema.templates.orgId, org.id), eq(schema.templates.status, "approved"), eq(schema.templates.category, "UTILITY"))),
  ]);
  return (
    <>
      <PageHeader title="Services & hours" description={`What customers can book, and when. Up to ${limitsFor(org.plan).appointmentsPerMonth} bookings a month on your plan.`} />
      <div className="max-w-4xl space-y-6 p-6">
        <Card className="p-5">
          <h2 className="mb-3 type-heading">Services</h2>
          {services.length > 0 && (
            <div className="mb-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Service</Th>
                    <Th>Length</Th>
                    <Th>At once</Th>
                    <Th>Price</Th>
                    <Th>Staff / branch</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {services.map((x) => (
                    <tr key={x.id}>
                      <Td className="font-medium">
                        {x.name} {!x.active && <Badge>Hidden</Badge>}
                      </Td>
                      <Td>{x.durationMinutes} min</Td>
                      <Td>{x.capacity}</Td>
                      <Td>{x.priceMinor ? formatMoney(x.priceMinor) : "—"}</Td>
                      <Td className="text-muted">{[team.find((t) => t.id === x.staffId)?.name, x.branch].filter(Boolean).join(" · ") || "—"}</Td>
                      <Td>
                        <SaveForm action={toggleService} success="Service updated">
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="active" value={x.active ? "0" : "1"} />
                          <SubmitButton size="sm" variant="ghost">{x.active ? "Hide" : "Show"}</SubmitButton>
                        </SaveForm>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          <SaveForm action={saveService} success="Service saved" resetOnSuccess className="grid gap-3 sm:grid-cols-3">
            <Field label="New service" htmlFor="sname">
              <Input id="sname" name="name" placeholder="Dental check-up" required />
            </Field>
            <Field label="Length (minutes)" htmlFor="dur">
              <Input id="dur" name="durationMinutes" type="number" min={5} max={480} defaultValue={30} />
            </Field>
            <Field label="Bookings at the same time" htmlFor="cap" hint="Chairs, rooms or staff free at once.">
              <Input id="cap" name="capacity" type="number" min={1} max={100} defaultValue={1} />
            </Field>
            <Field label="Price (₹, optional)" htmlFor="sprice">
              <Input id="sprice" name="price" inputMode="decimal" />
            </Field>
            <Field label="Staff (optional)" htmlFor="staff">
              <Select id="staff" name="staffId">
                <option value="">Anyone</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Branch (optional)" htmlFor="branch">
              <Input id="branch" name="branch" />
            </Field>
            <div>
              <SubmitButton size="sm">Add service</SubmitButton>
            </div>
          </SaveForm>
        </Card>
        <SaveForm action={saveBookingSettings} success="Hours and reminders saved" className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 type-heading">Bookable hours</h2>
            <div className="space-y-2">
              {DAYS.map(([k, label]) => {
                const h = s.hours[k];
                return (
                  <div key={k} className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex w-32 items-center gap-2">
                      <input type="checkbox" name={`${k}_on`} defaultChecked={Boolean(h)} /> {label}
                    </label>
                    <Input type="time" name={`${k}_open`} aria-label={`${label} from`} defaultValue={h?.open ?? "09:00"} className="w-32" />
                    <span className="text-muted">to</span>
                    <Input type="time" name={`${k}_close`} aria-label={`${label} until`} defaultValue={h?.close ?? "18:00"} className="w-32" />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Times are in {org.timezone}.</p>
          </Card>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Start a slot every (minutes)" htmlFor="slot">
              <Input id="slot" name="slotMinutes" type="number" min={5} max={240} defaultValue={s.slotMinutes} />
            </Field>
            <Field label="Earliest booking from now (minutes)" htmlFor="lead">
              <Input id="lead" name="leadMinutes" type="number" min={0} defaultValue={s.leadMinutes} />
            </Field>
            <Field label="Bookable days ahead" htmlFor="ahead">
              <Input id="ahead" name="daysAhead" type="number" min={1} max={90} defaultValue={s.daysAhead} />
            </Field>
            <Field label="Remind customers (hours before)" htmlFor="remind">
              <Input id="remind" name="reminderHours" type="number" min={1} max={168} defaultValue={s.reminderHours} />
            </Field>
            <Field
              label="Reminder template"
              htmlFor="rtpl"
              hint="Used when the customer hasn't messaged in 24 hours, as WhatsApp requires. Variables: {{1}} name, {{2}} service, {{3}} time."
            >
              <Select id="rtpl" name="reminderTemplateId" defaultValue={s.reminderTemplateId ?? ""}>
                <option value="">None (skip and leave a note)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <SubmitButton>Save hours & reminders</SubmitButton>
        </SaveForm>
      </div>
    </>
  );
}
