import type { AutomationTrigger } from "@/db/schema";

export const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  conversation_started: "A new conversation starts",
  order_created: "An order is created",
  order_paid: "An order is paid",
  appointment_booked: "An appointment is booked",
  lead_won: "A lead is moved to a won stage",
  no_reply: "The customer hasn't replied to us",
  cart_abandoned: "A store checkout is abandoned",
  ad_clicked: "Someone messages from a Click to WhatsApp ad",
};

/** What each trigger can fill into messages, as {key} in text or a template variable. */
export const TRIGGER_VARS: Record<AutomationTrigger, string[]> = {
  conversation_started: ["name"],
  order_created: ["name", "order_number", "order_total", "payment_link", "store_order"],
  order_paid: ["name", "order_number", "order_total", "store_order"],
  appointment_booked: ["name", "appointment_time", "service"],
  lead_won: ["name", "lead_title"],
  no_reply: ["name"],
  cart_abandoned: ["name", "cart_url", "cart_total"],
  ad_clicked: ["name", "ad_headline"],
};
