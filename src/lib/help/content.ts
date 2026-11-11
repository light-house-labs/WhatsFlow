import { SHORTCUTS, type Combo } from "@/lib/shortcuts";

/** Tours the help drawer can replay. Each one lives next to the screen it explains. */
export type TourId = "flow-builder";

type UpTo<N extends 3 | 4, T> = N extends 3 ? [] | [T] | [T, T] | [T, T, T] : [T] | [T, T] | [T, T, T] | [T, T, T, T];

export type HelpEntry = {
  title: string;
  /** One line: what the page is for. */
  purpose: string;
  howTo: UpTo<4, { step: string; detail: string }>;
  tips: UpTo<3, string>;
  shortcuts: { label: string; keys: Combo }[];
  links: { label: string; href: string }[];
  tour?: TourId;
};

/**
 * In-app help, one entry per route. Keys are route patterns as in `src/app`: `[id]` matches any one
 * segment. A route with no entry of its own uses its nearest parent's (`/contacts/segments/[id]` →
 * `/contacts/segments`).
 */
export const HELP: Record<string, HelpEntry> = {
  "/dashboard": {
    title: "Dashboard",
    purpose: "A seven-day snapshot of enquiries, chats, sales and support, plus your setup checklist.",
    howTo: [
      { step: "Finish getting started", detail: "Work down the checklist. Each item ticks itself once the real thing is done." },
      { step: "Read the numbers", detail: "Every figure covers the last 7 days in your workspace's time zone, except open items, which are live." },
      { step: "Jump into work", detail: "Open inbox takes you to waiting chats. Unassigned conversations are the ones nobody owns yet." },
    ],
    tips: [
      "A high 'answered by bot' share means your flows are handling the routine questions.",
      "Avg first human reply only counts chats a person actually answered.",
      "Admins see more detail, by teammate and by day, in Analytics.",
    ],
    shortcuts: [{ label: "Search anything", keys: SHORTCUTS.search }],
    links: [
      { label: "Analytics", href: "/analytics" },
      { label: "Inbox", href: "/inbox" },
    ],
  },

  "/inbox": {
    title: "Inbox",
    purpose: "Every WhatsApp conversation in one place, shared by your whole team.",
    howTo: [
      { step: "Pick a chat", detail: "Filter to Mine, Unassigned or Bot, or search by name, number or message text." },
      { step: "Take it over", detail: "Assign the chat to yourself. The bot steps aside while a person is handling it." },
      { step: "Reply", detail: "Type in the composer. Outside WhatsApp's 24-hour window you can only send an approved template." },
      { step: "Turn it into work", detail: "From the chat, create a lead, an order, a ticket or a booking without leaving the conversation." },
    ],
    tips: [
      "Type / in the composer to insert a quick reply.",
      "Close a chat when it is done so All stays an honest to-do list.",
      "Notes are only visible to your team, never to the customer.",
    ],
    shortcuts: [
      { label: "Send", keys: SHORTCUTS.send },
      { label: "New line", keys: SHORTCUTS.newLine },
      { label: "Quick replies", keys: "/" },
    ],
    links: [
      { label: "Quick replies and hours", href: "/settings" },
      { label: "Chat routing", href: "/settings/routing" },
    ],
  },

  "/enquiries": {
    title: "Enquiries",
    purpose: "Each new question from a customer, who answered it and how quickly.",
    howTo: [
      { step: "Scan the list", detail: "Newest first. The status shows whether a bot answered it or it still needs a person." },
      { step: "Filter by source", detail: "Narrow to an ad, a campaign or a keyword to see what is actually bringing people in." },
      { step: "Answer the waiting ones", detail: "Open an enquiry that needs a human to go straight to its chat in the inbox." },
    ],
    tips: [
      "Click-to-WhatsApp ads are tagged with the ad they came from.",
      "First response time stops at the first human reply, not the bot's.",
      "If one question keeps coming up, answer it in a bot flow.",
    ],
    shortcuts: [],
    links: [
      { label: "Bot flows", href: "/bots" },
      { label: "Analytics", href: "/analytics" },
    ],
  },

  "/tickets": {
    title: "Tickets",
    purpose: "Support requests with an owner, a status and the chat that started them.",
    howTo: [
      { step: "Raise a ticket", detail: "From a conversation in the inbox, or automatically with an Open ticket block in a bot flow." },
      { step: "Give it an owner", detail: "Assign it to the teammate who will see it through. Unowned tickets are easy to lose." },
      { step: "Move it along", detail: "Open while you work on it, Pending while you wait on the customer, Resolved when it is fixed." },
    ],
    tips: [
      "Every ticket links back to its chat, so the full history is one click away.",
      "Filter to Open to see what still needs doing.",
      "Resolve rather than delete, so it counts in your reports.",
    ],
    shortcuts: [],
    links: [{ label: "Inbox", href: "/inbox" }],
  },

  "/tickets/[id]": {
    title: "Ticket",
    purpose: "One support request: its status, owner, notes and the conversation behind it.",
    howTo: [
      { step: "Read the context", detail: "The linked chat shows exactly what the customer said and what was already tried." },
      { step: "Update the status", detail: "Pending pauses it while you wait on the customer; Resolved closes it." },
      { step: "Reply in the chat", detail: "Open the conversation to message the customer. Replies stay in the chat history." },
    ],
    tips: ["Reassign rather than leave a ticket with someone who is away.", "Write a note on what fixed it; the next person will thank you."],
    shortcuts: [],
    links: [{ label: "All tickets", href: "/tickets" }],
  },

  "/contacts": {
    title: "Contacts",
    purpose: "Everyone who has messaged you or been added, with their tags, fields and history.",
    howTo: [
      { step: "Find someone", detail: "Search by name, number or email, or filter by tag." },
      { step: "Add a contact", detail: "Use Create contact, or import a CSV to add many at once." },
      { step: "Organise them", detail: "Tag contacts so you can group them into segments and target campaigns." },
      { step: "Respect opt-outs", detail: "Contacts who opted out of marketing are skipped by campaigns automatically." },
    ],
    tips: [
      "Numbers are stored in international format, so +91 98… and 098… are the same person.",
      "Bot flows can tag contacts for you as they answer questions.",
      "Open a contact to see every order, ticket, booking and chat in one timeline.",
    ],
    shortcuts: [{ label: "Search contacts", keys: SHORTCUTS.search }],
    links: [
      { label: "Import contacts", href: "/contacts/import" },
      { label: "Segments", href: "/contacts/segments" },
    ],
  },

  "/contacts/[id]": {
    title: "Contact",
    purpose: "One customer's details, tags and everything they have done with you.",
    howTo: [
      { step: "Edit details", detail: "Change the name, email, tags or custom fields. Saved bot answers appear here too." },
      { step: "Read the timeline", detail: "Orders, tickets, bookings, leads and chats, newest first." },
      { step: "Message them", detail: "Open the chat to reply, or start one with an approved template if it has been over 24 hours." },
    ],
    tips: ["Marketing opt-out only stops campaigns; you can still reply to them.", "Tags are lower case and shared across the workspace."],
    shortcuts: [],
    links: [{ label: "All contacts", href: "/contacts" }],
  },

  "/contacts/import": {
    title: "Import contacts",
    purpose: "Bring in a CSV from Excel, Google Sheets or another CRM without creating duplicates.",
    howTo: [
      { step: "Upload a CSV", detail: "One row per person with at least a phone number column. A header row is required." },
      { step: "Match the columns", detail: "Tell us which column is the name, phone, email and any tags or custom fields." },
      { step: "Review and import", detail: "Rows with an existing number update that contact; new numbers create new contacts." },
    ],
    tips: [
      "Include the country code, or set the default country before importing.",
      "Add a tag to the whole import so you can find this batch later.",
      "Only import people who agreed to hear from you on WhatsApp.",
    ],
    shortcuts: [],
    links: [{ label: "Contacts", href: "/contacts" }],
  },

  "/contacts/segments": {
    title: "Segments",
    purpose: "Saved filters over your contacts that stay up to date as people change.",
    howTo: [
      { step: "Create a segment", detail: "Combine rules on tags, fields, orders and last message date." },
      { step: "Check the count", detail: "The live count shows how many contacts match right now." },
      { step: "Use it", detail: "Pick the segment as a campaign audience; it is re-evaluated at send time." },
    ],
    tips: ["'All of' narrows the group, 'any of' widens it.", "Opted-out contacts are still counted but never sent marketing."],
    shortcuts: [],
    links: [
      { label: "Campaigns", href: "/campaigns" },
      { label: "Contacts", href: "/contacts" },
    ],
  },

  "/pipeline": {
    title: "Pipeline",
    purpose: "Your open leads on a board, from first enquiry to won or lost.",
    howTo: [
      { step: "Add leads", detail: "Create one from a chat in the inbox, or let a bot flow's Create lead block do it." },
      { step: "Move cards", detail: "Drag a card to the next stage as the deal progresses." },
      { step: "Close it out", detail: "Drop it on Won or Lost. Won value shows on the dashboard for the week." },
    ],
    tips: [
      "Give each lead a value so the pipeline total means something.",
      "Answers a bot collected are copied into the lead's notes.",
      "Assign leads so every card has someone chasing it.",
    ],
    shortcuts: [],
    links: [{ label: "Inbox", href: "/inbox" }],
  },

  "/orders": {
    title: "Orders",
    purpose: "Orders taken in chat, with their payment and delivery status.",
    howTo: [
      { step: "Take an order", detail: "Create one here, from a chat, or let a bot's Take an order block build it." },
      { step: "Get paid", detail: "Send a payment link. The order flips to Paid when your payment provider confirms." },
      { step: "Fulfil it", detail: "Move it through packed, shipped and delivered. The customer can be told at each step." },
    ],
    tips: [
      "Unpaid customers get one reminder after the delay set in Payments.",
      "Store orders from Shopify or WooCommerce show here once connected.",
      "Search by order number with # in the command palette.",
    ],
    shortcuts: [{ label: "Find an order by number", keys: SHORTCUTS.search }],
    links: [
      { label: "Payments", href: "/settings/payments" },
      { label: "Catalog", href: "/catalog" },
    ],
  },

  "/orders/new": {
    title: "New order",
    purpose: "Build an order by hand for a customer.",
    howTo: [
      { step: "Choose the customer", detail: "Search your contacts by name or number." },
      { step: "Add products", detail: "Prices come from the catalog. Change quantities as needed." },
      { step: "Create and send", detail: "Save the order, then send a payment link from the order page." },
    ],
    tips: ["Products that are inactive or out of stock can't be added."],
    shortcuts: [],
    links: [{ label: "Catalog", href: "/catalog" }],
  },

  "/orders/[id]": {
    title: "Order",
    purpose: "One order: items, payment, delivery and the customer's chat.",
    howTo: [
      { step: "Check payment", detail: "See whether the link was sent, opened or paid." },
      { step: "Update delivery", detail: "Change the status as you pack and ship it." },
      { step: "Talk to the customer", detail: "Open the chat to confirm details or share tracking." },
    ],
    tips: ["Cancel unpaid orders you won't fulfil so stock is released."],
    shortcuts: [],
    links: [{ label: "All orders", href: "/orders" }],
  },

  "/catalog": {
    title: "Catalog",
    purpose: "The products bots and agents can sell in chat.",
    howTo: [
      { step: "Add a product", detail: "Name, price and an image. SKU and stock are optional." },
      { step: "Track stock", detail: "Set a stock count and it goes down with each order. Leave it blank to not track." },
      { step: "Hide what you don't sell", detail: "Turn a product off instead of deleting it, so old orders keep their history." },
    ],
    tips: [
      "Bots list up to 10 in-stock products in a Take an order block.",
      "Connect a store to sync products instead of typing them.",
      "Short names read better in WhatsApp lists (24 characters).",
    ],
    shortcuts: [],
    links: [
      { label: "Connected apps", href: "/settings/integrations" },
      { label: "Orders", href: "/orders" },
    ],
  },

  "/appointments": {
    title: "Appointments",
    purpose: "Bookings made in chat or by your team, on one calendar.",
    howTo: [
      { step: "Set up services", detail: "Add what can be booked, how long it takes and your hours in Services & hours." },
      { step: "Book someone", detail: "Create a booking for a contact, or let a bot offer free times." },
      { step: "Manage the day", detail: "Mark bookings as done or no-show, or reschedule." },
    ],
    tips: [
      "Customers get a reminder before their appointment if you set one up.",
      "Only free times inside your hours are offered.",
      "Rescheduling tells the customer on WhatsApp.",
    ],
    shortcuts: [],
    links: [{ label: "Services & hours", href: "/appointments/settings" }],
  },

  "/appointments/settings": {
    title: "Services & hours",
    purpose: "What customers can book, for how long, and when you're available.",
    howTo: [
      { step: "Add a service", detail: "Give it a name, a length and an optional price." },
      { step: "Set your hours", detail: "Weekly opening times. Bots never offer a slot outside them." },
      { step: "Set a reminder", detail: "Choose how many hours before the appointment the customer is reminded." },
    ],
    tips: ["A Booking block in a bot flow needs at least one active service."],
    shortcuts: [],
    links: [
      { label: "Appointments", href: "/appointments" },
      { label: "Bot flows", href: "/bots" },
    ],
  },

  "/campaigns": {
    title: "Campaigns",
    purpose: "Broadcast an approved template to a list or segment, and see how it landed.",
    howTo: [
      { step: "Create a campaign", detail: "Pick an approved template and an audience." },
      { step: "Check reach and cost", detail: "You see who it reaches and roughly what Meta will charge before sending." },
      { step: "Send or schedule", detail: "Send now or pick a time. Sending can be paused." },
      { step: "Read the results", detail: "Sent, delivered, read and replied, per campaign." },
    ],
    tips: [
      "Opted-out contacts are skipped automatically.",
      "Replies land in the inbox like any other chat.",
      "Start small: a segment of engaged customers first.",
    ],
    shortcuts: [],
    links: [
      { label: "Templates", href: "/templates" },
      { label: "Segments", href: "/contacts/segments" },
    ],
  },

  "/campaigns/new": {
    title: "New campaign",
    purpose: "Pick a template and an audience, check the cost, then send.",
    howTo: [
      { step: "Choose a template", detail: "Only templates Meta has approved can be broadcast." },
      { step: "Choose the audience", detail: "A segment, a tag or everyone who has not opted out." },
      { step: "Fill the variables", detail: "Map each {{1}}-style placeholder to a contact field or fixed text." },
      { step: "Review and send", detail: "Check the reach and estimated cost, then send now or schedule." },
    ],
    tips: ["Marketing templates cost more than utility ones in most countries."],
    shortcuts: [],
    links: [{ label: "Templates", href: "/templates" }],
  },

  "/campaigns/[id]": {
    title: "Campaign",
    purpose: "How one broadcast performed, and who it reached.",
    howTo: [
      { step: "Read the funnel", detail: "Sent, delivered, read and replied, as counts and percentages." },
      { step: "Check failures", detail: "Failed sends list the reason Meta gave, such as an invalid number." },
      { step: "Follow up", detail: "Replies are in the inbox; tag responders to target them next time." },
    ],
    tips: ["Read receipts are missing for people who have them turned off."],
    shortcuts: [],
    links: [{ label: "All campaigns", href: "/campaigns" }],
  },

  "/templates": {
    title: "Templates",
    purpose: "Pre-approved messages for starting chats, broadcasts and replies after 24 hours.",
    howTo: [
      { step: "Create a template", detail: "Write the message, add variables and optional buttons or a media header." },
      { step: "Submit for approval", detail: "Meta reviews it, usually within minutes, sometimes up to a day." },
      { step: "Use it", detail: "Approved templates appear in the inbox composer, campaigns and automations." },
    ],
    tips: [
      "Pick the right category: utility for updates, marketing for promotions.",
      "Rejected? Edit the wording and resubmit. Avoid vague variables.",
      "Templates are tied to your WhatsApp business account.",
    ],
    shortcuts: [],
    links: [{ label: "Campaigns", href: "/campaigns" }],
  },

  "/templates/new": {
    title: "New template",
    purpose: "Write a message once, then reuse it in replies, broadcasts and bots.",
    howTo: [
      { step: "Name and category", detail: "Lower-case name with underscores, and the category that matches its purpose." },
      { step: "Write the body", detail: "Use {{1}}, {{2}} for parts that change per customer. Add sample values." },
      { step: "Add extras", detail: "An image, video or document header, and up to 3 buttons." },
      { step: "Submit", detail: "It goes to Meta for review. You'll see the status on the Templates page." },
    ],
    tips: ["Give realistic samples; Meta rejects templates whose samples don't make sense."],
    shortcuts: [],
    links: [{ label: "Templates", href: "/templates" }],
  },

  "/bots": {
    title: "Bot flows",
    purpose: "Automatic conversations that answer, qualify and sell before a person steps in.",
    howTo: [
      { step: "Create a flow", detail: "Start from scratch or edit the starter flow made for your business." },
      { step: "Choose a trigger", detail: "A keyword such as 'menu', or any new conversation." },
      { step: "Test it", detail: "Try it on the sandbox phone. Drafts can be tested too." },
      { step: "Set it live", detail: "Only live flows answer real customers." },
    ],
    tips: [
      "Keyword flows win over 'any new conversation' flows.",
      "End with Hand over to team so nobody gets stuck.",
      "Runs count how many times each flow has started.",
    ],
    shortcuts: [],
    links: [
      { label: "Sandbox phone", href: "/settings/sandbox" },
      { label: "AI replies", href: "/settings/ai" },
    ],
  },

  "/bots/[id]": {
    title: "Flow builder",
    purpose: "Design a bot conversation by adding blocks and connecting them.",
    howTo: [
      { step: "Add blocks", detail: "Pick from the list on the left. The new block appears to the right of the last one." },
      { step: "Connect them", detail: "Drag from a dot on the right of one block to the left edge of the next." },
      { step: "Edit settings", detail: "Click a block to change its message, buttons or saved answer on the right." },
      { step: "Test, then set live", detail: "Test saves and opens the sandbox phone. Save and set live when it works." },
    ],
    tips: [
      "Each button or list option gets its own connection.",
      "Use {field} in a message to insert a saved answer.",
      "Select a block and press Backspace to delete it.",
    ],
    shortcuts: [{ label: "Delete selected block", keys: "backspace" }],
    links: [
      { label: "All flows", href: "/bots" },
      { label: "Sandbox phone", href: "/settings/sandbox" },
    ],
    tour: "flow-builder",
  },

  "/automations": {
    title: "Automations",
    purpose: "Messages and actions that run on their own when something happens.",
    howTo: [
      { step: "Create an automation", detail: "Pick a trigger: a new order, a tag added, a booking, a store event." },
      { step: "Add steps", detail: "Wait, send a template, tag the contact or update a record." },
      { step: "Turn it on", detail: "Only active automations run. Each run is logged." },
    ],
    tips: [
      "Messages outside the 24-hour window must use an approved template.",
      "Going over your plan limit pauses automations until the next period.",
      "Use a wait step so follow-ups don't feel robotic.",
    ],
    shortcuts: [],
    links: [
      { label: "Templates", href: "/templates" },
      { label: "Connected apps", href: "/settings/integrations" },
    ],
  },

  "/automations/[id]": {
    title: "Automation",
    purpose: "Edit one automation's trigger and steps.",
    howTo: [
      { step: "Set the trigger", detail: "What starts it, with any conditions." },
      { step: "Build the steps", detail: "They run top to bottom. Waits pause before the next step." },
      { step: "Save and switch on", detail: "Changes apply to new runs, not ones already waiting." },
    ],
    tips: ["Check the run log after the first few triggers to be sure it behaves."],
    shortcuts: [],
    links: [{ label: "All automations", href: "/automations" }],
  },

  "/analytics": {
    title: "Analytics",
    purpose: "How fast your team replies, how much bots handle, and what it earns.",
    howTo: [
      { step: "Pick a range", detail: "Switch between the last 7, 30 or 90 days." },
      { step: "Filter by teammate", detail: "See one person's chats, reply times and closed tickets." },
      { step: "Compare sources", detail: "See which ads, campaigns and keywords bring enquiries that convert." },
    ],
    tips: [
      "Reply times only count hours you're open, if hours are set.",
      "Bot share rising while reply time drops is the goal.",
      "Download raw data from Your data for your own reports.",
    ],
    shortcuts: [],
    links: [{ label: "Dashboard", href: "/dashboard" }],
  },

  "/support": {
    title: "Talk to a person",
    purpose: "Ask the WhatsFlow team for help with anything.",
    howTo: [
      { step: "Describe the problem", detail: "What you were trying to do, what happened, and the page you were on." },
      { step: "Send it", detail: "A real person replies, usually within a working day." },
    ],
    tips: ["Screenshots or a chat link help us fix things faster."],
    shortcuts: [],
    links: [{ label: "Dashboard", href: "/dashboard" }],
  },

  // ---- settings ----
  "/settings": {
    title: "Inbox settings",
    purpose: "Your business name, time zone, opening hours, welcome and away messages, and quick replies.",
    howTo: [
      { step: "Set your hours", detail: "Opening hours decide when the welcome or the away message goes out." },
      { step: "Write auto-replies", detail: "A welcome for new chats in hours, an away message after hours." },
      { step: "Add quick replies", detail: "Short answers you reuse. Type / in the inbox to insert one." },
    ],
    tips: [
      "Variables like {name} are filled in per customer.",
      "The time zone also sets the day boundaries in reports.",
      "Keep auto-replies short; bots can do the long answers.",
    ],
    shortcuts: [{ label: "Insert a quick reply (in the composer)", keys: "/" }],
    links: [
      { label: "Inbox", href: "/inbox" },
      { label: "Chat routing", href: "/settings/routing" },
    ],
  },

  "/settings/team": {
    title: "Team",
    purpose: "Who can use this workspace and what they're allowed to do.",
    howTo: [
      { step: "Invite someone", detail: "Enter their email and pick a role. They get a link to join." },
      { step: "Choose the role", detail: "Agents work the inbox. Admins can also change settings." },
      { step: "Manage seats", detail: "Change a role, remove someone, or revoke an invite that went astray." },
    ],
    tips: [
      "Only an owner can make another owner.",
      "Your plan sets how many seats you have.",
      "Removed teammates' chats stay; reassign them.",
    ],
    shortcuts: [],
    links: [
      { label: "Chat routing", href: "/settings/routing" },
      { label: "Plan & billing", href: "/settings/billing" },
    ],
  },

  "/settings/routing": {
    title: "Chat routing",
    purpose: "Decide who gets each new chat, automatically.",
    howTo: [
      { step: "Add a rule", detail: "Match on the number, a keyword, a tag or the ad the chat came from." },
      { step: "Pick who gets it", detail: "A teammate, round-robin, the least busy, or nobody (just label it)." },
      { step: "Order the rules", detail: "Rules run top to bottom and the first match wins." },
    ],
    tips: ["Least busy spreads chats evenly across the team.", "A label alone is fine: choose Nobody, just label it."],
    shortcuts: [],
    links: [
      { label: "Team", href: "/settings/team" },
      { label: "Inbox", href: "/inbox" },
    ],
  },

  "/settings/whatsapp": {
    title: "WhatsApp numbers",
    purpose: "Connect your business number through Meta's official Cloud API.",
    howTo: [
      { step: "Get your details from Meta", detail: "In Meta Business Manager, find the phone number ID, WABA ID and a system user token." },
      { step: "Connect", detail: "Paste them in and run the check." },
      { step: "Add the webhook", detail: "Copy the webhook URL and verify token into your Meta app so messages arrive." },
      { step: "Watch the health", detail: "Quality rating and messaging tier come from Meta. A failing check says how to fix it." },
    ],
    tips: [
      "The number stays yours; you can disconnect at any time.",
      "Disconnecting deletes the stored access token.",
      "Try everything on the sandbox phone first.",
    ],
    shortcuts: [],
    links: [
      { label: "Sandbox phone", href: "/settings/sandbox" },
      { label: "Templates", href: "/templates" },
    ],
  },

  "/settings/sandbox": {
    title: "Sandbox phone",
    purpose: "A pretend customer phone for trying bots and replies without a Meta account.",
    howTo: [
      { step: "Send a message", detail: "Type as if you were a customer. It arrives in your inbox like a real one." },
      { step: "Test a flow", detail: "Use Test in the flow builder, or send the flow's keyword here." },
      { step: "Reply from the inbox", detail: "Answer in the inbox and watch it appear on this phone." },
    ],
    tips: ["Bots and auto-replies run as normal.", "Nothing here is sent over real WhatsApp, so it's free."],
    shortcuts: [{ label: "Send", keys: SHORTCUTS.send }],
    links: [
      { label: "Bot flows", href: "/bots" },
      { label: "Inbox", href: "/inbox" },
    ],
  },

  "/settings/ai": {
    title: "AI replies",
    purpose: "Let AI answer what your bot flows don't, using only what you tell it.",
    howTo: [
      { step: "Write your knowledge", detail: "Hours, prices, delivery areas, policies. It only answers from this." },
      { step: "Choose what it can see", detail: "Include your catalog so it can talk about products and prices." },
      { step: "Set a limit", detail: "After this many AI replies the chat is handed to your team." },
      { step: "Switch it on", detail: "Bot flows always go first; AI only answers what is left." },
    ],
    tips: [
      "Test it on the sandbox phone before switching on.",
      "If it doesn't know, it hands over rather than guessing.",
      "Add your cancellation policy; it's the question people ask most.",
    ],
    shortcuts: [],
    links: [
      { label: "Bot flows", href: "/bots" },
      { label: "Sandbox phone", href: "/settings/sandbox" },
    ],
  },

  "/settings/payments": {
    title: "Payments",
    purpose: "Connect Razorpay or Stripe so orders can be paid with a link in chat.",
    howTo: [
      { step: "Connect a provider", detail: "Paste your API keys. Money goes straight to your own account." },
      { step: "Add the webhook", detail: "Copy the webhook URL into your provider so paid links update orders." },
      { step: "Set reminders", detail: "Choose when unpaid customers get one reminder. 0 turns it off." },
    ],
    tips: ["If both are connected, Razorpay is used.", "Use test keys first and pay a test order."],
    shortcuts: [],
    links: [{ label: "Orders", href: "/orders" }],
  },

  "/settings/integrations": {
    title: "Connected apps",
    purpose: "Sync your online store and Google Sheets with WhatsFlow.",
    howTo: [
      { step: "Connect a store", detail: "Shopify or WooCommerce. Orders and products start syncing." },
      { step: "Send a test order", detail: "Place one on your store to check it arrives here." },
      { step: "Sync a sheet", detail: "Share the sheet with the service account, then paste its link." },
    ],
    tips: [
      "Store orders can trigger WhatsApp automations.",
      "Sheets sync needs the service account shared on the sheet.",
      "Disconnecting stops the sync but keeps what was imported.",
    ],
    shortcuts: [],
    links: [
      { label: "Automations", href: "/automations" },
      { label: "Catalog", href: "/catalog" },
    ],
  },

  "/settings/developers": {
    title: "API & webhooks",
    purpose: "API keys and outgoing webhooks for connecting your own systems.",
    howTo: [
      { step: "Create an API key", detail: "It's shown once, so copy it straight away." },
      { step: "Add a webhook", detail: "Pick the events and the URL we should send them to." },
      { step: "Test it", detail: "Use Test to queue a sample delivery, then check the log." },
    ],
    tips: [
      "Verify the signature on every webhook you receive.",
      "Filter the request log to failures to debug.",
      "Revoke keys you no longer use.",
    ],
    shortcuts: [],
    links: [{ label: "Audit log", href: "/settings/audit" }],
  },

  "/settings/billing": {
    title: "Plan & billing",
    purpose: "Your plan, its limits and what you pay.",
    howTo: [
      { step: "Compare plans", detail: "Limits cover seats, bookings, broadcasts and automation runs." },
      { step: "Change plan", detail: "Upgrades apply now; downgrades at the end of the period." },
      { step: "Check usage", detail: "See how close you are to each limit this period." },
    ],
    tips: ["Going over a limit pauses automations and broadcasts.", "Only the owner can change the plan or cancel."],
    shortcuts: [],
    links: [{ label: "Team", href: "/settings/team" }],
  },

  "/settings/data": {
    title: "Your data",
    purpose: "Export a copy of your records, or delete the workspace.",
    howTo: [
      { step: "Export", detail: "Download contacts, chats, orders and more as files you can open anywhere." },
      { step: "Delete, if you must", detail: "Type the workspace name to confirm. It cannot be undone." },
    ],
    tips: ["Download your data before deleting anything.", "Exports include only this workspace."],
    shortcuts: [],
    links: [{ label: "Audit log", href: "/settings/audit" }],
  },

  "/settings/audit": {
    title: "Audit log",
    purpose: "Who changed what in your workspace, and when.",
    howTo: [
      { step: "Scan the changes", detail: "Newest first, with the person and the details of each change." },
      { step: "Go further back", detail: "Use Older to page back in time." },
    ],
    tips: ["Covers team, numbers, integrations, keys and billing.", "Entries cannot be edited or deleted."],
    shortcuts: [],
    links: [{ label: "Team", href: "/settings/team" }],
  },
};

const FALLBACK: HelpEntry = {
  title: "Help",
  purpose: "Find your way around WhatsFlow.",
  howTo: [
    { step: "Search anything", detail: "Pages, settings, contacts, orders and messages, from one box." },
    { step: "Ask us", detail: "Talk to a person if you're stuck. A real human replies." },
  ],
  tips: [],
  shortcuts: [{ label: "Search", keys: SHORTCUTS.search }],
  links: [{ label: "Dashboard", href: "/dashboard" }],
};

function matches(pattern: string, parts: string[]): boolean {
  const p = pattern.split("/").filter(Boolean);
  return p.length === parts.length && p.every((s, i) => (s.startsWith("[") ? true : s === parts[i]));
}

/** The help entry for a pathname: the exact route, else its nearest parent with an entry. */
export function helpFor(pathname: string): HelpEntry {
  const parts = pathname.split(/[?#]/)[0].split("/").filter(Boolean);
  // Static segments beat [id] at the same depth: /contacts/import is not /contacts/[id].
  const keys = Object.keys(HELP).sort((a, b) => a.split("[").length - b.split("[").length);
  for (let n = parts.length; n > 0; n--) {
    const head = parts.slice(0, n);
    const k = keys.find((key) => matches(key, head));
    if (k) return HELP[k];
  }
  return FALLBACK;
}
