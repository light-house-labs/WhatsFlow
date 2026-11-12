"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarCheck, CalendarX, MessageSquare, RotateCcw, UserX } from "lucide-react";
import { ActionSheet, type SheetAction } from "@/components/bottom-sheet";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { StickyActions } from "@/components/mobile/grouped";
import { Field, Input, Select, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { bookByStaff, setAppointmentStatus } from "./actions";

export type MobileBooking = { id: string; time: string; customer: string; detail: string; notes: string | null; status: string; conversationId: string | null };

/** One booking row; tapping it opens the same status actions the desktop list shows inline. */
export function BookingRow({ b }: { b: MobileBooking }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const set = async (status: string) => {
    const form = new FormData();
    form.set("id", b.id);
    form.set("status", status);
    try {
      await setAppointmentStatus(form);
      toast.success("Appointment updated");
      router.refresh();
    } catch {
      toast.error("Couldn't update the booking. Try again.");
    }
  };
  const actions: SheetAction[] = [
    ...(b.status === "booked"
      ? [
          { label: "Mark done", icon: <CalendarCheck />, onSelect: () => void set("completed") },
          { label: "No-show", icon: <UserX />, onSelect: () => void set("no_show") },
          { label: "Cancel booking", icon: <CalendarX />, danger: true, onSelect: () => void set("cancelled") },
        ]
      : b.status !== "cancelled"
        ? [{ label: "Undo", description: "Back to booked", icon: <RotateCcw />, onSelect: () => void set("booked") }]
        : []),
    ...(b.conversationId ? [{ label: "Open chat", icon: <MessageSquare />, onSelect: () => router.push(`/inbox?c=${b.conversationId}`) }] : []),
  ];
  return (
    <li className="group/row">
      <button type="button" onClick={() => setOpen(true)} disabled={!actions.length} className="tap flex min-h-14 w-full items-center gap-3 pl-4 text-left active:bg-fill disabled:active:bg-transparent">
        <span className="w-16 shrink-0 text-[15px] font-semibold tabular-nums">{b.time}</span>
        <span className="flex min-h-14 min-w-0 flex-1 items-center gap-3 border-b border-line py-2.5 pr-4 group-last/row:border-0">
          <span className="min-w-0 flex-1">
            <span className="row-title block truncate">{b.customer}</span>
            <span className="row-meta block truncate">{b.detail}</span>
            {b.notes && <span className="row-meta block truncate">{b.notes}</span>}
          </span>
          <StatusBadge status={b.status} />
        </span>
      </button>
      {open && <ActionSheet title={`${b.customer} · ${b.time}`} actions={actions} onClose={() => setOpen(false)} />}
    </li>
  );
}

/** Full-screen "New booking" form with the save bar pinned to the bottom. */
export function MobileBookingForm({
  date,
  services,
  contacts,
}: {
  date: string;
  services: { id: string; name: string; durationMinutes: number }[];
  contacts: { id: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <SaveForm action={bookByStaff} success="Appointment booked" onSaved={() => router.replace(`/appointments?date=${date}`)} className="flex min-h-full flex-col bg-app px-4 pt-4">
      <div className="flex-1 space-y-4 rounded-xl bg-surface p-4">
        <Field label="Customer" htmlFor="m-contactId">
          <Select id="m-contactId" name="contactId" required className="h-11">
            <option value="">Choose…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service" htmlFor="m-serviceId">
          <Select id="m-serviceId" name="serviceId" required className="h-11">
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min)
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="m-date">
            <Input id="m-date" name="date" type="date" defaultValue={date} required className="h-11" />
          </Field>
          <Field label="Time" htmlFor="m-time">
            <Input id="m-time" name="time" type="time" required className="h-11" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="m-notes">
          <Input id="m-notes" name="notes" className="h-11" />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="checkbox" name="notify" defaultChecked className="size-5" /> Send a confirmation on WhatsApp
        </label>
      </div>
      <StickyActions>
        <SubmitButton>Book</SubmitButton>
      </StickyActions>
    </SaveForm>
  );
}
