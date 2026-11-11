import type { BusinessHours } from "@/db/schema";

type Day = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

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
export function localParts(at: Date, timeZone: string): { day: Day; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as Day;
  return { day, hhmm: `${get("hour")}:${get("minute")}` };
}

export function isOpen(hours: BusinessHours, timeZone: string, at = new Date()): boolean {
  const { day, hhmm } = localParts(at, timeZone);
  const slot = hours[day];
  if (!slot) return false;
  return hhmm >= slot.open && hhmm < slot.close;
}

const DAY_ORDER: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_NAMES: Record<Day, string> = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Open now · closes 7:00 PM" or "Closed · opens Mon 9:00 AM", for status displays. */
export function openingStatus(hours: BusinessHours, timeZone: string, at = new Date()): { open: boolean; text: string } {
  const { day, hhmm } = localParts(at, timeZone);
  const today = hours[day];
  if (today && hhmm >= today.open && hhmm < today.close) return { open: true, text: `Open now · closes ${clock(today.close)}` };
  if (today && hhmm < today.open) return { open: false, text: `Closed · opens ${clock(today.open)}` };
  const i = DAY_ORDER.indexOf(day);
  for (let n = 1; n <= 7; n++) {
    const d = DAY_ORDER[(i + n) % 7];
    const slot = hours[d];
    if (slot) return { open: false, text: `Closed · opens ${n === 1 ? "tomorrow" : DAY_NAMES[d]} ${clock(slot.open)}` };
  }
  return { open: false, text: "Closed · no opening hours set" };
}
