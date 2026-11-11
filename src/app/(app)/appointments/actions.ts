"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { BusinessHours } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { bookAppointment, BookingError, bookingSettingsFor, cancelAppointment, zonedToUtc } from "@/lib/booking";
import { parseMoney } from "@/lib/plans";
import { sendInConversation, SendError } from "@/lib/wa/outbound";
import { slotLabel } from "@/lib/booking";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const clamp = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || dflt));

export async function saveBookingSettings(form: FormData): Promise<void> {
  const ctx = await requireOrg("admin");
  await bookingSettingsFor(ctx.db, ctx.org.id);
  const hours: BusinessHours = {};
  for (const d of DAYS) {
    hours[d] = form.get(`${d}_on`) === "on" ? { open: String(form.get(`${d}_open`) || "09:00"), close: String(form.get(`${d}_close`) || "18:00") } : null;
  }
  await ctx.db
    .update(schema.bookingSettings)
    .set({
      hours,
      slotMinutes: clamp(form.get("slotMinutes"), 5, 240, 30),
      leadMinutes: clamp(form.get("leadMinutes"), 0, 7 * 1440, 60),
      daysAhead: clamp(form.get("daysAhead"), 1, 90, 14),
      reminderHours: clamp(form.get("reminderHours"), 1, 168, 24),
      reminderTemplateId: String(form.get("reminderTemplateId") ?? "") || null,
    })
    .where(eq(schema.bookingSettings.orgId, ctx.org.id));
  revalidatePath("/appointments/settings");
}

export async function saveService(form: FormData): Promise<{ error: string } | undefined> {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the service a name." };
  const values = {
    name: name.slice(0, 80),
    durationMinutes: clamp(form.get("durationMinutes"), 5, 480, 30),
    capacity: clamp(form.get("capacity"), 1, 100, 1),
    priceMinor: parseMoney(String(form.get("price") ?? "0")) ?? 0,
    staffId: String(form.get("staffId") ?? "") || null,
    branch: String(form.get("branch") ?? "").trim() || null,
    active: form.get("active") !== "off",
  };
  if (id) await ctx.db.update(schema.services).set(values).where(and(eq(schema.services.id, id), eq(schema.services.orgId, ctx.org.id)));
  else await ctx.db.insert(schema.services).values({ orgId: ctx.org.id, ...values });
  revalidatePath("/appointments/settings");
}

export async function toggleService(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  await ctx.db.update(schema.services).set({ active: form.get("active") === "1" }).where(and(eq(schema.services.id, id), eq(schema.services.orgId, ctx.org.id)));
  revalidatePath("/appointments/settings");
}

export async function bookByStaff(form: FormData): Promise<{ error: string } | undefined> {
  const ctx = await requireOrg();
  const contactId = String(form.get("contactId") ?? "");
  const [contact] = await ctx.db.select().from(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.orgId, ctx.org.id)));
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  if (!contact || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Pick a customer, a date and a time." };
  const [y, m, d] = date.split("-").map(Number);
  const startAt = zonedToUtc(y, m, d, time, ctx.org.timezone);
  const [conv] = await ctx.db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, contact.id)).limit(1);
  try {
    const { appt, service } = await bookAppointment(ctx.db, {
      orgId: ctx.org.id,
      serviceId: String(form.get("serviceId") ?? ""),
      contactId: contact.id,
      conversationId: conv?.id ?? null,
      startAt,
      source: "staff",
      notes: String(form.get("notes") ?? "").trim() || null,
    });
    if (form.get("notify") === "on" && conv) {
      await sendInConversation(
        ctx.db,
        conv.id,
        { kind: "text", body: `You're booked: ${service.name} on ${slotLabel(appt.startAt, ctx.org.timezone)} at ${ctx.org.name}. Reply CANCEL or RESCHEDULE any time.` },
        { senderKind: "user", senderUserId: ctx.user.id },
      ).catch((e) => {
        if (!(e instanceof SendError)) throw e;
      });
    }
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/appointments");
  redirect(`/appointments?date=${date}`);
}

export async function setAppointmentStatus(form: FormData) {
  const ctx = await requireOrg();
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  if (status === "cancelled") await cancelAppointment(ctx.db, ctx.org.id, id);
  else if (status === "completed" || status === "no_show" || status === "booked") {
    await ctx.db.update(schema.appointments).set({ status }).where(and(eq(schema.appointments.id, id), eq(schema.appointments.orgId, ctx.org.id)));
  }
  revalidatePath("/appointments");
}
