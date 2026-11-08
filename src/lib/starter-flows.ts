import type { FlowEdge, FlowNode, FlowTrigger } from "@/db/schema";

export type Starter = { key: string; name: string; description: string; trigger: FlowTrigger; graph: { nodes: FlowNode[]; edges: FlowEdge[] } };

type Step = Omit<FlowNode, "position"> & { next?: string | string[] };

/** Lay steps out left to right; `next` lists targets, one per button or row. */
function flow(steps: Step[]): Starter["graph"] {
  const col = new Map<string, number>([[steps[0].id, 0]]);
  const rowsInCol = new Map<number, number>();
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  for (const s of steps) {
    const c = col.get(s.id) ?? 0;
    const r = rowsInCol.get(c) ?? 0;
    rowsInCol.set(c, r + 1);
    nodes.push({ id: s.id, type: s.type, data: s.data, position: { x: 40 + c * 300, y: 40 + r * 150 } });
    const targets = s.next === undefined ? [] : Array.isArray(s.next) ? s.next : [s.next];
    const branching = s.type === "buttons" || s.type === "list" || s.type === "condition";
    targets.forEach((t, i) => {
      if (!col.has(t)) col.set(t, c + 1);
      const handle = s.type === "condition" ? (i === 0 ? "yes" : "no") : branching ? String(i) : null;
      edges.push({ id: `e-${s.id}-${i}`, source: s.id, target: t, sourceHandle: handle });
    });
  }
  return { nodes, edges };
}

const handover = (id: string, text = "Connecting you to our team now. They'll reply here shortly."): Step => ({ id, type: "handover", data: { text } });

export const STARTERS: Record<string, Starter> = {
  clinic: {
    key: "clinic",
    name: "Clinic: appointments and questions",
    description: "Books visits, shares timings and fees, and hands urgent cases to the front desk.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "appointment", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Hello! How can we help you today?", buttons: ["Book a visit", "Timings & fees", "Urgent help"], saveAs: "choice" }, next: ["name", "info", "urgent"] },
      { id: "name", type: "question", data: { text: "Sure. What's the patient's name?", saveAs: "patient" }, next: "day" },
      { id: "info", type: "message", data: { text: "We're open Mon–Sat, 9am–7pm. Consultation fee: (add your fee). Reply MENU to go back." } },
      { id: "urgent", type: "ticket", data: { subject: "Urgent: patient needs help" }, next: "h" },
      { id: "day", type: "question", data: { text: "Which day and time suit {patient}?", saveAs: "preferred_time" }, next: "lead" },
      handover("h", "If this is an emergency, please call emergency services. Our front desk will reply here right away."),
      { id: "lead", type: "lead", data: { title: "Visit for {patient}" }, next: "ok" },
      { id: "ok", type: "message", data: { text: "Thanks! We'll confirm {patient}'s visit for {preferred_time} shortly." } },
    ]),
  },
  store: {
    key: "store",
    name: "Online store: order, track, support",
    description: "Shows your catalog, takes orders with a payment link, and tracks the latest order.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "order", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Hi! What would you like to do?", buttons: ["Shop now", "Track my order", "Talk to us"] }, next: ["shop", "track", "h"] },
      { id: "shop", type: "products", data: { text: "Here's what's in stock. Pick one to order:" } },
      { id: "track", type: "order_status", data: {}, next: "more" },
      handover("h"),
      { id: "more", type: "message", data: { text: "Anything else? Reply MENU to see options again." } },
    ]),
  },
  realestate: {
    key: "realestate",
    name: "Real estate: qualify buyers",
    description: "Asks budget, location and timeline, then creates a lead for your sales team.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "property", "flat", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Hi! Are you looking to buy, rent, or sell?", buttons: ["Buy", "Rent", "Sell"], saveAs: "intent" }, next: ["where", "where", "where"] },
      { id: "where", type: "question", data: { text: "Which area or locality are you interested in?", saveAs: "area" }, next: "budget" },
      { id: "budget", type: "list", data: { text: "What's your budget?", button: "Choose budget", rows: ["Under 50 lakh", "50 lakh – 1 crore", "1–2 crore", "Above 2 crore"], saveAs: "budget" }, next: ["when", "when", "when", "when"] },
      { id: "when", type: "question", data: { text: "When are you planning to move?", saveAs: "timeline" }, next: "tag" },
      { id: "tag", type: "tag", data: { tag: "property-enquiry" }, next: "lead" },
      { id: "lead", type: "lead", data: { title: "{intent} in {area}, {budget}" }, next: "ok" },
      { id: "ok", type: "message", data: { text: "Thanks! An advisor will share matching options for {area} shortly." } },
    ]),
  },
  education: {
    key: "education",
    name: "Education: admissions enquiries",
    description: "Captures the course and student details, and answers fee and schedule questions.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "admission", "course", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Welcome! What would you like to know?", buttons: ["Admissions", "Fees & schedule", "Talk to a counsellor"] }, next: ["course", "fees", "h"] },
      { id: "course", type: "question", data: { text: "Which course are you interested in?", saveAs: "course" }, next: "student" },
      { id: "fees", type: "message", data: { text: "Our fee structure and batch timings: (add your details). Reply MENU for more." } },
      handover("h", "A counsellor will reply here shortly."),
      { id: "student", type: "question", data: { text: "What's the student's name and current class or year?", saveAs: "student" }, next: "lead" },
      { id: "lead", type: "lead", data: { title: "Admission: {course}" }, next: "ok" },
      { id: "ok", type: "message", data: { text: "Thank you! Our admissions team will call you about {course} soon." } },
    ]),
  },
  restaurant: {
    key: "restaurant",
    name: "Restaurant: menu, orders, tables",
    description: "Shares the menu, takes orders from your catalog and handles table requests.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "menu", "order"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Hi! Hungry? What can we do for you?", buttons: ["Order food", "Reserve a table", "Opening hours"] }, next: ["order", "party", "hours"] },
      { id: "order", type: "products", data: { text: "Today's menu. Pick a dish:" } },
      { id: "party", type: "question", data: { text: "For how many people, and what time?", saveAs: "table" }, next: "lead" },
      { id: "hours", type: "message", data: { text: "We're open every day, 11am–11pm. Reply MENU to order." } },
      { id: "lead", type: "lead", data: { title: "Table: {table}" }, next: "ok" },
      { id: "ok", type: "message", data: { text: "Got it! We'll confirm your table ({table}) in a moment." } },
    ]),
  },
  salon: {
    key: "salon",
    name: "Salon: services and bookings",
    description: "Lists services and prices, takes booking requests and tags new clients.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "book", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "list", data: { text: "Hi! Which service would you like?", button: "See services", rows: ["Haircut", "Hair colour", "Facial", "Manicure & pedicure", "Something else"], saveAs: "service" }, next: ["when", "when", "when", "when", "h"] },
      { id: "when", type: "question", data: { text: "Lovely, {service}. Which day and time suit you?", saveAs: "slot" }, next: "tag" },
      handover("h", "Tell us what you have in mind and our stylist will reply here."),
      { id: "tag", type: "tag", data: { tag: "booking-request" }, next: "lead" },
      { id: "lead", type: "lead", data: { title: "{service} on {slot}" }, next: "ok" },
      { id: "ok", type: "message", data: { text: "Thanks! We'll confirm your {service} for {slot} shortly." } },
    ]),
  },
  services: {
    key: "services",
    name: "Services: quotes and support",
    description: "Collects job details for a quote, and opens a ticket for existing customers.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "quote", "help", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Hi! How can we help?", buttons: ["Get a quote", "I need support", "Something else"] }, next: ["job", "issue", "h"] },
      { id: "job", type: "question", data: { text: "Tell us about the job: what, where and when?", saveAs: "job" }, next: "lead" },
      { id: "issue", type: "question", data: { text: "Sorry to hear that. What's the problem?", saveAs: "issue" }, next: "ticket" },
      handover("h"),
      { id: "lead", type: "lead", data: { title: "Quote request" }, next: "ok1" },
      { id: "ticket", type: "ticket", data: { subject: "Support: {issue}" }, next: "ok2" },
      { id: "ok1", type: "message", data: { text: "Thanks! We'll send you a quote shortly." } },
      { id: "ok2", type: "message", data: { text: "We've logged it and someone will get back to you here soon." } },
    ]),
  },
  general: {
    key: "general",
    name: "Welcome menu",
    description: "A simple menu: prices, book a visit, or talk to the team.",
    trigger: { kind: "keyword", keywords: ["hi", "hello", "menu"] },
    graph: flow([
      { id: "t", type: "trigger", data: {}, next: "menu" },
      { id: "menu", type: "buttons", data: { text: "Hi! What can we help you with?", buttons: ["Prices", "Book a visit", "Talk to us"] }, next: ["prices", "day", "h"] },
      { id: "prices", type: "message", data: { text: "Our price list: (add your prices here)." } },
      { id: "day", type: "question", data: { text: "Great! What day suits you?", saveAs: "preferred_day" }, next: "lead" },
      handover("h"),
      { id: "lead", type: "lead", data: { title: "Visit request" } },
    ]),
  },
};

const BY_INDUSTRY: Record<string, string> = {
  "Clinic or healthcare": "clinic",
  "Online store": "store",
  "Real estate": "realestate",
  Education: "education",
  "Restaurant or cafe": "restaurant",
  "Salon or spa": "salon",
  Services: "services",
};

export function starterFor(industry: string | null): Starter {
  return STARTERS[BY_INDUSTRY[industry ?? ""] ?? "general"];
}
