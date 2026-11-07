import type { AutomationTrigger } from "@/db/schema";

export const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  conversation_started: "A new conversation starts",
  order_created: "An order is created",
  order_paid: "An order is paid",
  appointment_booked: "An appointment is booked",
  lead_won: "A lead is moved to a won stage",
  no_reply: "The customer hasn't replied to us",
};
