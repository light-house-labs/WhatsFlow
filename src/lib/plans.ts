import type { Plan } from "@/db/schema";

export type PlanLimits = {
  seats: number;
  botFlows: number;
  numbers: number;
};

export type PlanInfo = {
  id: Plan;
  name: string;
  tagline: string;
  /** Monthly price in paise (INR minor units), excluding GST. */
  monthlyMinor: number;
  /** Yearly price in paise: two months free. */
  yearlyMinor: number;
  limits: PlanLimits;
  features: string[];
};

export const PLANS: Record<Plan, PlanInfo> = {
  trial: {
    id: "trial",
    name: "Trial",
    tagline: "14 days, everything in Starter, sandbox number included",
    monthlyMinor: 0,
    yearlyMinor: 0,
    limits: { seats: 2, botFlows: 3, numbers: 1 },
    features: [],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For a shop or clinic with a small front desk",
    monthlyMinor: 2499_00,
    yearlyMinor: 2499_00 * 10,
    limits: { seats: 3, botFlows: 5, numbers: 1 },
    features: [
      "Shared inbox, labels, notes, quick replies",
      "Contacts, enquiries, tickets, pipeline",
      "Broadcasts with approved templates",
      "5 bot flows",
      "3 team members",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "For sales and support teams working the same number",
    monthlyMinor: 5499_00,
    yearlyMinor: 5499_00 * 10,
    limits: { seats: 8, botFlows: 1000, numbers: 2 },
    features: [
      "Everything in Starter",
      "Unlimited bot flows",
      "8 team members, 2 WhatsApp numbers",
      "Priority human support",
    ],
  },
  custom: {
    id: "custom",
    name: "Custom",
    tagline: "More numbers, seats and custom work",
    monthlyMinor: 0,
    yearlyMinor: 0,
    limits: { seats: 1000, botFlows: 100000, numbers: 20 },
    features: ["Everything in Team", "Custom limits", "Onboarding with our team"],
  },
};

export const PAID_PLANS: Plan[] = ["starter", "team"];

export function limitsFor(plan: Plan): PlanLimits {
  return PLANS[plan].limits;
}

export type Usage = { seats: number; liveFlows: number; numbers: number };

/** Items that exceed a plan's limits. Empty when the account fits. */
export function overLimit(plan: Plan, usage: Usage): string[] {
  const l = limitsFor(plan);
  const out: string[] = [];
  if (usage.seats > l.seats) out.push(`${usage.seats - l.seats} team member(s) over the ${l.seats}-seat limit`);
  if (usage.liveFlows > l.botFlows) out.push(`${usage.liveFlows - l.botFlows} live bot flow(s) over the limit of ${l.botFlows}`);
  if (usage.numbers > l.numbers) out.push(`${usage.numbers - l.numbers} WhatsApp number(s) over the limit of ${l.numbers}`);
  return out;
}

export function formatMoney(minor: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}
