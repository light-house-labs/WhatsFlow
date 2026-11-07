import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { zonedToUtc } from "@/lib/booking";
import { formatWaId } from "@/lib/phone";
import { Alert, Button, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from "@/components/ui";
import { bookByStaff, setAppointmentStatus } from "./actions";

export const metadata: Metadata = { title: "Appointments" };

function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function shift(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  const tz = org.timezone;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIn(tz);
  const [y, m, dd] = date.split("-").map(Number);
  const start = zonedToUtc(y, m, dd, "00:00", tz);
  const [ny, nm, nd] = shift(date, 1).split("-").map(Number);
  const end = zonedToUtc(ny, nm, nd, "00:00", tz);
  const [rows, services, contacts] = await Promise.all([
    d
      .select({ a: schema.appointments, s: schema.services, c: schema.contacts, staff: schema.users.name })
      .from(schema.appointments)
      .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.appointments.contactId))
      .leftJoin(schema.users, eq(schema.users.id, schema.services.staffId))
      .where(and(eq(schema.appointments.orgId, org.id), gte(schema.appointments.startAt, start), lt(schema.appointments.startAt, end)))
      .orderBy(asc(schema.appointments.startAt)),
    d.select().from(schema.services).where(and(eq(schema.services.orgId, org.id), eq(schema.services.active, true))).orderBy(asc(schema.services.name)),
    d.select().from(schema.contacts).where(eq(schema.contacts.orgId, org.id)).orderBy(desc(schema.contacts.lastInboundAt)).limit(300),
  ]);
  const time = (at: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  const heading = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T00:00:00Z`));
  const booked = rows.filter((r) => r.a.status === "booked").length;
  return (
    <>
      <PageHeader
        title="Appointments"
        description="Bookings made in WhatsApp or by your team."
        actions={role !== "agent" ? <ButtonLink href="/appointments/settings" variant="secondary">Services & hours</ButtonLink> : undefined}
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {sp.error && <Alert tone="danger">{sp.error}</Alert>}
          <div className="flex items-center gap-2">
            <ButtonLink href={`/appointments?date=${shift(date, -1)}`} variant="secondary" size="sm" aria-label="Previous day">
              <ChevronLeft size={16} />
            </ButtonLink>
            <ButtonLink href={`/appointments?date=${shift(date, 1)}`} variant="secondary" size="sm" aria-label="Next day">
              <ChevronRight size={16} />
            </ButtonLink>
            <h2 className="font-semibold">{heading}</h2>
            <span className="text-sm text-muted">· {booked} booked</span>
            {date !== todayIn(tz) && (
              <Link href="/appointments" className="ml-auto text-sm text-accent">
                Today
              </Link>
            )}
          </div>
          <Card>
            {rows.length === 0 ? (
              <EmptyState icon={<CalendarDays />} title="Nothing booked" body={services.length ? "Customers book from a bot flow's “Offer booking times” block, or add one here." : "Add a service under Services & hours, then add a booking block to a bot flow."} />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map(({ a, s, c, staff }) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                    <div className="w-20 font-semibold tabular-nums">{time(a.startAt)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.name ?? formatWaId(c.waId)}</div>
                      <div className="text-muted">
                        {s.name} · {s.durationMinutes} min{staff ? ` · ${staff}` : ""}
                        {s.branch ? ` · ${s.branch}` : ""} · via {a.source}
                      </div>
                      {a.notes && <div className="mt-1 whitespace-pre-wrap text-xs text-muted">{a.notes}</div>}
                    </div>
                    <StatusBadge status={a.status} />
                    <form action={setAppointmentStatus} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      {a.status === "booked" ? (
                        <>
                          <Button size="sm" variant="ghost" name="status" value="completed">Done</Button>
                          <Button size="sm" variant="ghost" name="status" value="no_show">No-show</Button>
                          <Button size="sm" variant="ghost" name="status" value="cancelled" className="text-danger">Cancel</Button>
                        </>
                      ) : a.status !== "cancelled" ? (
                        <Button size="sm" variant="ghost" name="status" value="booked">Undo</Button>
                      ) : null}
                    </form>
                    {a.conversationId && (
                      <Link href={`/inbox?c=${a.conversationId}`} className="text-accent">
                        Chat
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Add a booking</h2>
          {services.length === 0 ? (
            <p className="text-sm text-muted">Add a service first.</p>
          ) : (
            <form action={bookByStaff} className="space-y-3">
              <Field label="Customer" htmlFor="contactId">
                <Select id="contactId" name="contactId" required>
                  <option value="">Choose…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? formatWaId(c.waId)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Service" htmlFor="serviceId">
                <Select id="serviceId" name="serviceId" required>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min)
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date" htmlFor="date">
                  <Input id="date" name="date" type="date" defaultValue={date} required />
                </Field>
                <Field label="Time" htmlFor="time">
                  <Input id="time" name="time" type="time" required />
                </Field>
              </div>
              <Field label="Notes" htmlFor="notes">
                <Input id="notes" name="notes" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notify" defaultChecked /> Send a confirmation on WhatsApp
              </label>
              <Button className="w-full">Book</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
