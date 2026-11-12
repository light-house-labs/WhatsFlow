import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { zonedToUtc } from "@/lib/booking";
import { formatWaId } from "@/lib/phone";
import { ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from "@/components/ui";
import { bookByStaff, setAppointmentStatus } from "./actions";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { DesktopOnly, Group, GroupEmpty, MobileOnly, MobileScreen } from "@/components/mobile/grouped";
import { BookingRow, MobileBookingForm } from "./mobile-bookings";

export const metadata: Metadata = { title: "Appointments" };

function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function shift(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; error?: string; new?: string }> }) {
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
  const dayNav = "tap grid size-10 place-items-center rounded-full bg-surface text-ink active:bg-fill";
  return (
    <>
      <MobileOnly>
        {sp.new ? (
          services.length ? (
            <MobileBookingForm
              date={date}
              services={services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes }))}
              contacts={contacts.map((c) => ({ id: c.id, label: c.name ?? formatWaId(c.waId) }))}
            />
          ) : (
            <MobileScreen>
              <GroupEmpty icon={<CalendarDays />} title="No services yet" description="Add the services customers can book on a computer first: Appointments, Services & hours." />
            </MobileScreen>
          )
        ) : (
          <MobileScreen>
            <div className="flex items-center gap-2">
              <Link href={`/appointments?date=${shift(date, -1)}`} replace data-nav="none" aria-label="Previous day" className={dayNav}>
                <ChevronLeft size={20} />
              </Link>
              <div className="min-w-0 flex-1 text-center">
                <div className="truncate text-base font-semibold">{heading}</div>
                <div className="text-13 text-faint">
                  {booked} booked
                  {date !== todayIn(tz) && (
                    <>
                      {" · "}
                      <Link href="/appointments" replace data-nav="none" className="font-medium text-accent-text">
                        Today
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <Link href={`/appointments?date=${shift(date, 1)}`} replace data-nav="none" aria-label="Next day" className={dayNav}>
                <ChevronRight size={20} />
              </Link>
            </div>
            {rows.length === 0 ? (
              <GroupEmpty
                icon={<CalendarDays />}
                title={services.length ? "Nothing booked" : "No services yet"}
                description={services.length ? "No bookings for this day yet. Tap + to add one." : "Add the services customers can book first."}
              />
            ) : (
              <Group>
                {rows.map(({ a, s, c, staff }) => (
                  <BookingRow
                    key={a.id}
                    b={{
                      id: a.id,
                      time: time(a.startAt),
                      customer: c.name ?? formatWaId(c.waId),
                      detail: `${s.name} · ${s.durationMinutes} min${staff ? ` · ${staff}` : ""}${s.branch ? ` · ${s.branch}` : ""}`,
                      notes: a.notes,
                      status: a.status,
                      conversationId: a.conversationId,
                    }}
                  />
                ))}
              </Group>
            )}
          </MobileScreen>
        )}
      </MobileOnly>
      <DesktopOnly>
      <PageHeader
        title="Appointments"
        description="Bookings made in WhatsApp or by your team."
        actions={role !== "agent" ? <ButtonLink href="/appointments/settings" variant="secondary">Services & hours</ButtonLink> : undefined}
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ButtonLink href={`/appointments?date=${shift(date, -1)}`} variant="secondary" size="sm" aria-label="Previous day">
              <ChevronLeft size={16} />
            </ButtonLink>
            <ButtonLink href={`/appointments?date=${shift(date, 1)}`} variant="secondary" size="sm" aria-label="Next day">
              <ChevronRight size={16} />
            </ButtonLink>
            <h2 className="type-heading">{heading}</h2>
            <span className="text-sm text-muted">· {booked} booked</span>
            {date !== todayIn(tz) && (
              <Link href="/appointments" className="ml-auto text-sm link">
                Today
              </Link>
            )}
          </div>
          {rows.length === 0 ? (
services.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="No services yet"
              description="Add the services customers can book, with their duration and opening hours."
              primary={{ label: "Add a service", href: "/appointments/settings", allow: role !== "agent" }}
              askAdmin="add a service"
            />
          ) : (
            <EmptyState
              icon={<CalendarDays />}
              title="Nothing booked"
              description="No bookings for this day yet."
              primary={{ label: "New booking", href: "#booking" }}
              hint={
                <>
                  Customers can also book from an “Offer booking times” block in a <Link href="/bots">bot flow</Link>.
                </>
              }
            />
          )
) : (
<Card>
              <ul className="divide-y divide-line">
                {rows.map(({ a, s, c, staff }) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                    <div className="w-20 text-13 font-medium tabular-nums">{time(a.startAt)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.name ?? formatWaId(c.waId)}</div>
                      <div className="text-muted">
                        {s.name} · {s.durationMinutes} min{staff ? ` · ${staff}` : ""}
                        {s.branch ? ` · ${s.branch}` : ""} · via {a.source}
                      </div>
                      {a.notes && <div className="mt-1 whitespace-pre-wrap text-xs text-muted">{a.notes}</div>}
                    </div>
                    <StatusBadge status={a.status} />
                    <SaveForm action={setAppointmentStatus} success="Appointment updated" className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      {a.status === "booked" ? (
                        <>
                          <SubmitButton size="sm" variant="ghost" name="status" value="completed">Done</SubmitButton>
                          <SubmitButton size="sm" variant="ghost" name="status" value="no_show">No-show</SubmitButton>
                          <SubmitButton size="sm" variant="ghost" name="status" value="cancelled" className="text-danger">Cancel</SubmitButton>
                        </>
                      ) : a.status !== "cancelled" ? (
                        <SubmitButton size="sm" variant="ghost" name="status" value="booked">Undo</SubmitButton>
                      ) : null}
                    </SaveForm>
                    {a.conversationId && (
                      <Link href={`/inbox?c=${a.conversationId}`} className="link">
                        Chat
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
)}
        </div>
        {services.length > 0 && (
        <Card id="booking" className="h-fit p-5">
          <h2 className="mb-3 type-heading">Add a booking</h2>
            <SaveForm action={bookByStaff} success="Appointment booked" className="space-y-3">
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
              <SubmitButton className="w-full">Book</SubmitButton>
            </SaveForm>
        </Card>
        )}
      </div>
      </DesktopOnly>
    </>
  );
}
