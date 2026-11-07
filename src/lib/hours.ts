import type { BusinessHours } from "@/db/schema";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const DEFAULT_HOURS: BusinessHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "10:00", close: "14:00" },
  sun: null,
};

/** Local weekday and HH:MM for an instant in an IANA time zone. */
export function localParts(at: Date, timeZone: string): { day: (typeof DAYS)[number]; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as (typeof DAYS)[number];
  return { day, hhmm: `${get("hour")}:${get("minute")}` };
}

export function isOpen(hours: BusinessHours, timeZone: string, at = new Date()): boolean {
  const { day, hhmm } = localParts(at, timeZone);
  const slot = hours[day];
  if (!slot) return false;
  return hhmm >= slot.open && hhmm < slot.close;
}
