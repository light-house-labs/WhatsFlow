import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { BusinessHours } from "@/db/schema";
import { DEFAULT_HOURS } from "./hours";
import { emit } from "./events";
import { enqueue, kickJobs } from "./jobs";
import { limitsFor } from "./plans";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Milliseconds to add to a UTC instant to get wall-clock time in `timeZone`. */
function tzOffset(at: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at / 1000) * 1000;
}

/** The UTC instant of a wall-clock date and time in `timeZone`. Handles DST. */
export function zonedToUtc(y: number, m: number, d: number, hhmm: string, timeZone: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffset(guess, timeZone);
  return new Date(guess - tzOffset(first, timeZone));
}

function localDate(at: Date, timeZone: string) {
  const local = new Date(at.getTime() + tzOffset(at.getTime(), timeZone));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}

export async function bookingSettingsFor(d: DB, orgId: string) {
  const [s] = await d.select().from(schema.bookingSettings).where(eq(schema.bookingSettings.orgId, orgId)).limit(1);
  if (s) return s;
  const [created] = await d
    .insert(schema.bookingSettings)
    .values({ orgId, hours: DEFAULT_HOURS })
    .onConflictDoNothing()
    .returning();
  return created ?? (await d.select().from(schema.bookingSettings).where(eq(schema.bookingSettings.orgId, orgId)))[0];
}

/** Candidate start times inside opening hours, before checking what's already booked. Pure, for tests. */
export function candidateSlots(opts: {
  hours: BusinessHours;
  timeZone: string;
  slotMinutes: number;
  durationMinutes: number;
  leadMinutes: number;
  daysAhead: number;
  now: Date;
}): Date[] {
  const out: Date[] = [];
  const today = localDate(opts.now, opts.timeZone);
  const earliest = opts.now.getTime() + opts.leadMinutes * 60_000;
  for (let i = 0; i <= opts.daysAhead; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const h = opts.hours[DAYS[day.getUTCDay()]];
    if (!h) continue;
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const open = zonedToUtc(y, m, d, h.open, opts.timeZone).getTime();
    const close = zonedToUtc(y, m, d, h.close, opts.timeZone).getTime();
    for (let t = open; t + opts.durationMinutes * 60_000 <= close; t += opts.slotMinutes * 60_000) {
      if (t >= earliest) out.push(new Date(t));
    }
  }
  return out;
}

/** Free start times for a service, soonest first. */
export async function availableSlots(d: DB, orgId: string, serviceId: string, limit = 10, now = new Date()) {
  const [svc] = await d
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.id, serviceId), eq(schema.services.orgId, orgId), eq(schema.services.active, true)))
    .limit(1);
  if (!svc) return [];
  const [org] = await d.select({ tz: schema.orgs.timezone }).from(schema.orgs).where(eq(schema.orgs.id, orgId));
  const s = await bookingSettingsFor(d, orgId);
  const candidates = candidateSlots({
    hours: s.hours,
    timeZone: org.tz,
    slotMinutes: s.slotMinutes,
    durationMinutes: svc.durationMinutes,
    leadMinutes: s.leadMinutes,
    daysAhead: s.daysAhead,
    now,
  });
  if (!candidates.length) return [];
  const booked = await d
    .select({ startAt: schema.appointments.startAt, endAt: schema.appointments.endAt })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.serviceId, svc.id),
        eq(schema.appointments.status, "booked"),
        lt(schema.appointments.startAt, new Date(candidates[candidates.length - 1].getTime() + svc.durationMinutes * 60_000)),
        gt(schema.appointments.endAt, candidates[0]),
      ),
    );
  const out: Date[] = [];
  for (const c of candidates) {
    const end = c.getTime() + svc.durationMinutes * 60_000;
    const overlapping = booked.filter((b) => b.startAt.getTime() < end && b.endAt.getTime() > c.getTime()).length;
    if (overlapping < svc.capacity) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** "Mon 10 Nov, 10:30 am": fits a WhatsApp list row (24 chars). */
export function slotLabel(at: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(at);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(at);
  return `${day}, ${time}`.replace(/\s+/g, " ").slice(0, 24);
}

export class BookingError extends Error {}

export async function bookAppointment(
  d: DB,
  a: { orgId: string; serviceId: string; contactId: string; conversationId: string | null; startAt: Date; source: string; notes?: string | null },
) {
  const [svc] = await d
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.id, a.serviceId), eq(schema.services.orgId, a.orgId)))
    .limit(1);
  if (!svc) throw new BookingError("Service not found");
  const [org] = await d.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, a.orgId));
  const [{ month }] = await d
    .select({ month: sql<number>`count(*)` })
    .from(schema.appointments)
    .where(and(eq(schema.appointments.orgId, a.orgId), sql`${schema.appointments.createdAt} >= date_trunc('month', now())`));
  if (Number(month) >= limitsFor(org.plan).appointmentsPerMonth) {
    throw new BookingError("Online booking is full for this month. Please message us to book.");
  }
  const endAt = new Date(a.startAt.getTime() + svc.durationMinutes * 60_000);
  const appt = await d.transaction(async (tx) => {
    // Serialise bookings for this service so two customers can't take the last seat at once.
    await tx.execute(sql`select id from services where id = ${svc.id} for update`);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.serviceId, svc.id),
          eq(schema.appointments.status, "booked"),
          lt(schema.appointments.startAt, endAt),
          gt(schema.appointments.endAt, a.startAt),
        ),
      );
    if (Number(n) >= svc.capacity) throw new BookingError("That time was just taken. Please pick another.");
    const [row] = await tx
      .insert(schema.appointments)
      .values({
        orgId: a.orgId,
        serviceId: svc.id,
        contactId: a.contactId,
        conversationId: a.conversationId,
        startAt: a.startAt,
        endAt,
        source: a.source,
        notes: a.notes ?? null,
      })
      .returning();
    return row;
  });
  const s = await bookingSettingsFor(d, a.orgId);
  const remindAt = appt.startAt.getTime() - s.reminderHours * 3600_000;
  if (remindAt > Date.now()) await enqueue(d, "appointment.reminder", { appointmentId: appt.id }, remindAt - Date.now());
  await emit(
    d,
    a.orgId,
    "appointment.booked",
    { appointment: { id: appt.id, service: svc.name, startAt: appt.startAt.toISOString(), endAt: appt.endAt.toISOString(), contactId: a.contactId } },
    {
      contactId: a.contactId,
      conversationId: a.conversationId,
      key: `appointment:${appt.id}`,
      vars: { service: svc.name, appointment_time: slotLabel(appt.startAt, (await d.select({ tz: schema.orgs.timezone }).from(schema.orgs).where(eq(schema.orgs.id, a.orgId)))[0]?.tz ?? "Asia/Kolkata") },
    },
  );
  kickJobs(d);
  return { appt, service: svc };
}

export async function cancelAppointment(d: DB, orgId: string, id: string) {
  const [appt] = await d
    .update(schema.appointments)
    .set({ status: "cancelled" })
    .where(and(eq(schema.appointments.id, id), eq(schema.appointments.orgId, orgId), eq(schema.appointments.status, "booked")))
    .returning();
  if (appt) await emit(d, orgId, "appointment.cancelled", { appointment: { id: appt.id, startAt: appt.startAt.toISOString(), contactId: appt.contactId } });
  return appt ?? null;
}

/** The customer's next booked appointment, if any. */
export async function nextAppointment(d: DB, orgId: string, contactId: string) {
  const [row] = await d
    .select({ a: schema.appointments, service: schema.services })
    .from(schema.appointments)
    .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
    .where(
      and(
        eq(schema.appointments.orgId, orgId),
        eq(schema.appointments.contactId, contactId),
        eq(schema.appointments.status, "booked"),
        gt(schema.appointments.startAt, new Date()),
      ),
    )
    .orderBy(asc(schema.appointments.startAt))
    .limit(1);
  return row ?? null;
}
