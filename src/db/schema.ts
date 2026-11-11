import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export type Role = "owner" | "admin" | "agent";
export type Plan = "trial" | "starter" | "team" | "custom";

// ---------- accounts ----------

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    isStaff: boolean("is_staff").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_idx").on(t.tokenHash), index().on(t.userId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("password_resets_token_idx").on(t.tokenHash)],
);

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  industry: text("industry"),
  plan: text("plan").$type<Plan>().notNull().default("trial"),
  planInterval: text("plan_interval").$type<"month" | "year">().notNull().default("month"),
  billingStatus: text("billing_status")
    .$type<"trialing" | "active" | "cancelled" | "past_due">()
    .notNull()
    .default("trialing"),
  currentPeriodEnd: ts("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  pendingPlan: text("pending_plan").$type<Plan>(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /** Hours after a payment link is sent to remind an unpaid customer once. 0 turns it off. */
  paymentReminderHours: integer("payment_reminder_hours").notNull().default(24),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull().default("agent"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index().on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<Role>().notNull().default("agent"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: ts("accepted_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.tokenHash), index().on(t.orgId)],
);

// ---------- whatsapp ----------

export type BusinessProfile = { about?: string; description?: string; address?: string; email?: string; website?: string; vertical?: string; photoUrl?: string };

export const waNumbers = pgTable(
  "wa_numbers",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"sandbox" | "cloud">().notNull(),
    displayPhone: text("display_phone").notNull(),
    displayName: text("display_name").notNull(),
    phoneNumberId: text("phone_number_id"),
    wabaId: text("waba_id"),
    accessTokenEnc: text("access_token_enc"),
    verifyToken: text("verify_token").notNull(),
    status: text("status")
      .$type<"connected" | "pending" | "failed" | "disconnected">()
      .notNull()
      .default("pending"),
    statusDetail: text("status_detail"),
    qualityRating: text("quality_rating"),
    messagingTier: text("messaging_tier"),
    lastWebhookAt: ts("last_webhook_at"),
    lastCheckedAt: ts("last_checked_at"),
    /** What customers see on the business's WhatsApp profile; mirrored to Meta for Cloud API numbers. */
    profile: jsonb("profile").$type<BusinessProfile>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId), index().on(t.phoneNumberId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    waId: text("wa_id").notNull(),
    name: text("name"),
    email: text("email"),
    tags: text("tags").array().notNull().default([]),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull().default("whatsapp"),
    optedOutAt: ts("opted_out_at"),
    lastInboundAt: ts("last_inbound_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("contacts_org_wa_idx").on(t.orgId, t.waId), index().on(t.orgId, t.createdAt)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    numberId: uuid("number_id")
      .notNull()
      .references(() => waNumbers.id, { onDelete: "cascade" }),
    status: text("status").$type<"open" | "pending" | "closed">().notNull().default("open"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    handledBy: text("handled_by").$type<"bot" | "human">().notNull().default("bot"),
    labels: text("labels").array().notNull().default([]),
    lastInboundAt: ts("last_inbound_at"),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    waitingSince: ts("waiting_since"),
    /** Something the next customer reply answers, outside any bot flow (e.g. picking a new slot). */
    pending: jsonb("pending").$type<PendingPrompt | null>(),
    aiReplies: integer("ai_replies").notNull().default(0),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_contact_number_idx").on(t.contactId, t.numberId),
    index().on(t.orgId, t.lastMessageAt),
    index().on(t.assigneeId),
  ],
);

export type PendingPrompt = { kind: "reschedule"; appointmentId: string; serviceId: string; slots: string[] };

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "received";

export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    type: text("type").notNull().default("text"),
    body: text("body"),
    /** `body` folded for search (lower case, no accents); trigram-indexed in migration 0006. */
    bodySearch: text("body_search").generatedAlwaysAs(sql`public.wf_norm(body)`),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    waMessageId: text("wa_message_id"),
    status: text("status").$type<MessageStatus>().notNull(),
    error: text("error"),
    senderKind: text("sender_kind")
      .$type<"contact" | "user" | "bot" | "system" | "campaign">()
      .notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    templateId: uuid("template_id"),
    campaignId: uuid("campaign_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("messages_wa_id_idx").on(t.waMessageId),
    index().on(t.conversationId, t.createdAt),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.conversationId)],
);

export const quickReplies = pgTable(
  "quick_replies",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    shortcut: text("shortcut").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quick_replies_org_shortcut_idx").on(t.orgId, t.shortcut)],
);

export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string };

export type TemplateHeaderType = "text" | "image" | "video" | "document";

export const templates = pgTable(
  "templates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull().default("en"),
    category: text("category").$type<"MARKETING" | "UTILITY" | "AUTHENTICATION">().notNull(),
    /** Null means no header, or a text header when headerText is set. */
    headerType: text("header_type").$type<TemplateHeaderType>(),
    headerText: text("header_text"),
    /** Default image, video or document for a media header; also Meta's review sample. */
    headerMediaUrl: text("header_media_url"),
    body: text("body").notNull(),
    footer: text("footer"),
    buttons: jsonb("buttons").$type<TemplateButton[]>().notNull().default([]),
    status: text("status")
      .$type<"draft" | "pending" | "approved" | "rejected">()
      .notNull()
      .default("draft"),
    metaTemplateId: text("meta_template_id"),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("templates_org_name_lang_idx").on(t.orgId, t.name, t.language)],
);

export type Audience = { tags?: string[]; contactIds?: string[]; segmentId?: string; all?: boolean };

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "restrict" }),
    numberId: uuid("number_id")
      .notNull()
      .references(() => waNumbers.id, { onDelete: "cascade" }),
    audience: jsonb("audience").$type<Audience>().notNull(),
    // template variable index ("1") -> contact field ("name") or literal ("=text")
    variableMap: jsonb("variable_map").$type<Record<string, string>>().notNull().default({}),
    scheduledAt: ts("scheduled_at"),
    status: text("status")
      .$type<"draft" | "scheduled" | "sending" | "sent" | "cancelled">()
      .notNull()
      .default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [index().on(t.orgId, t.createdAt)],
);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: id(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    messageId: uuid("message_id"),
    status: text("status")
      .$type<"pending" | "sent" | "delivered" | "read" | "replied" | "failed" | "skipped">()
      .notNull()
      .default("pending"),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("campaign_recipients_unique_idx").on(t.campaignId, t.contactId),
    index().on(t.messageId),
  ],
);

// ---------- crm ----------

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").$type<"open" | "won" | "lost">().notNull().default("open"),
  },
  (t) => [index().on(t.orgId, t.position)],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    valueMinor: integer("value_minor").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull().default("whatsapp"),
    notes: text("notes"),
    nextFollowUpAt: ts("next_follow_up_at"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId, t.stageId), index().on(t.contactId)],
);

/** What Meta tells us about the ad or post a customer tapped to start the chat. */
export type AdReferral = {
  sourceId: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  /** Click id for Meta's Conversions API. */
  ctwaClid: string | null;
};

export const enquiries = pgTable(
  "enquiries",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    source: text("source").notNull().default("whatsapp"),
    status: text("status")
      .$type<"answered_by_bot" | "needs_human" | "answered" | "converted">()
      .notNull(),
    convertedTo: text("converted_to").$type<"lead" | "ticket">(),
    /** Set when the customer came from a Click to WhatsApp ad or post. */
    ad: jsonb("ad").$type<AdReferral>(),
    firstResponseSeconds: integer("first_response_seconds"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.createdAt)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    description: text("description"),
    status: text("status")
      .$type<"open" | "pending" | "resolved" | "closed">()
      .notNull()
      .default("open"),
    priority: text("priority").$type<"low" | "normal" | "high" | "urgent">().notNull().default("normal"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    resolvedAt: ts("resolved_at"),
    orderId: uuid("order_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tickets_org_number_idx").on(t.orgId, t.number), index().on(t.orgId, t.status)],
);

// ---------- automation ----------

export type FlowNode = {
  id: string;
  type:
    | "trigger"
    | "products"
    | "booking"
    | "order_status"
    | "message"
    | "buttons"
    | "list"
    | "question"
    | "condition"
    | "tag"
    | "lead"
    | "ticket"
    | "handover";
  position: { x: number; y: number };
  data: Record<string, unknown>;
};
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type FlowTrigger = { kind: "keyword"; keywords: string[] } | { kind: "any_new_conversation" };

export const botFlows = pgTable(
  "bot_flows",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: jsonb("trigger").$type<FlowTrigger>().notNull(),
    graph: jsonb("graph").$type<{ nodes: FlowNode[]; edges: FlowEdge[] }>().notNull(),
    status: text("status").$type<"draft" | "live">().notNull().default("draft"),
    runs: integer("runs").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const flowRuns = pgTable(
  "flow_runs",
  {
    id: id(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => botFlows.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    currentNodeId: text("current_node_id"),
    vars: jsonb("vars").$type<Record<string, string>>().notNull().default({}),
    status: text("status").$type<"waiting" | "done" | "handed_over">().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.conversationId, t.status)],
);

export type BusinessHours = Record<string, { open: string; close: string } | null>;

export const inboxSettings = pgTable("inbox_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id, { onDelete: "cascade" }),
  welcomeEnabled: boolean("welcome_enabled").notNull().default(true),
  welcomeMessage: text("welcome_message").notNull(),
  awayEnabled: boolean("away_enabled").notNull().default(true),
  awayMessage: text("away_message").notNull(),
  businessHours: jsonb("business_hours").$type<BusinessHours>().notNull(),
  waitAlertMinutes: integer("wait_alert_minutes").notNull().default(15),
  optOutKeywords: text("opt_out_keywords").array().notNull().default(["STOP", "UNSUBSCRIBE"]),
});

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    runAt: ts("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: ts("locked_until"),
    doneAt: ts("done_at"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.doneAt, t.runAt)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_ext_idx").on(t.provider, t.externalId)],
);

// ---------- support (talk to a person) and billing audit ----------

export const supportThreads = pgTable(
  "support_threads",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    status: text("status").$type<"open" | "answered" | "closed">().notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => supportThreads.id, { onDelete: "cascade" }),
    fromStaff: boolean("from_staff").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.threadId)],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.createdAt)],
);

// ---------- commerce ----------

export const products = pgTable(
  "products",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    imageUrl: text("image_url"),
    sku: text("sku"),
    /** Null means stock isn't tracked. */
    stock: integer("stock"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId, t.active)],
);

export type OrderItem = { productId: string | null; name: string; qty: number; priceMinor: number };
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "link_sent" | "paid" | "failed" | "refunded";

export const orders = pgTable(
  "orders",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    items: jsonb("items").$type<OrderItem[]>().notNull(),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status").$type<OrderStatus>().notNull().default("pending"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("unpaid"),
    paymentProvider: text("payment_provider").$type<PaymentProviderKind>(),
    paymentRef: text("payment_ref"),
    paymentUrl: text("payment_url"),
    paidAt: ts("paid_at"),
    source: text("source").notNull().default("inbox"),
    /** The order's id in Shopify or WooCommerce, for orders synced from a store. */
    externalId: text("external_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_org_number_idx").on(t.orgId, t.number),
    index().on(t.orgId, t.createdAt),
    index().on(t.contactId),
    index().on(t.paymentRef),
    uniqueIndex("orders_org_source_external_idx").on(t.orgId, t.source, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    detail: text("detail"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orderId, t.createdAt)],
);

export type PaymentProviderKind = "sandbox" | "razorpay" | "stripe";
export type StoreKind = "shopify" | "woocommerce";

/** Per-workspace credentials for third-party services. Secrets are encrypted at rest. */
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PaymentProviderKind | StoreKind | "google_sheets">().notNull(),
    configEnc: text("config_enc").notNull(),
    /** Non-secret display info, e.g. the key id's last 4 characters. */
    label: text("label"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integrations_org_kind_idx").on(t.orgId, t.kind)],
);

// ---------- appointments ----------

export const bookingSettings = pgTable("booking_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id, { onDelete: "cascade" }),
  hours: jsonb("hours").$type<BusinessHours>().notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(30),
  /** How soon the earliest bookable slot can be. */
  leadMinutes: integer("lead_minutes").notNull().default(60),
  daysAhead: integer("days_ahead").notNull().default(14),
  reminderHours: integer("reminder_hours").notNull().default(24),
  /** Approved utility template used when the 24-hour window is closed. {{1}} name, {{2}} service, {{3}} time. */
  reminderTemplateId: uuid("reminder_template_id").references(() => templates.id, { onDelete: "set null" }),
});

export const services = pgTable(
  "services",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    priceMinor: integer("price_minor").notNull().default(0),
    /** How many customers can book the same slot (e.g. number of chairs or staff). */
    capacity: integer("capacity").notNull().default(1),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    branch: text("branch"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    status: text("status").$type<"booked" | "cancelled" | "completed" | "no_show">().notNull().default("booked"),
    source: text("source").notNull().default("whatsapp"),
    notes: text("notes"),
    reminderSentAt: ts("reminder_sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.startAt), index().on(t.serviceId, t.startAt), index().on(t.contactId)],
);

// ---------- automations ----------

export type AutomationTrigger =
  | "conversation_started"
  | "order_created"
  | "order_paid"
  | "appointment_booked"
  | "lead_won"
  | "no_reply"
  | "cart_abandoned"
  | "ad_clicked";

export type AutomationStep =
  | { type: "wait"; minutes: number }
  | { type: "send_text"; text: string }
  /** variables fill {{1}}, {{2}}…: "name", or a key from the trigger such as "order_number" or "cart_url" */
  | { type: "send_template"; templateId: string; variables?: string[] }
  | { type: "add_tag"; tag: string }
  | { type: "assign"; userId: string }
  | { type: "if_tag"; tag: string };

export const automations = pgTable(
  "automations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: text("trigger").$type<AutomationTrigger>().notNull(),
    /** e.g. { minutes: 120 } for no_reply */
    triggerConfig: jsonb("trigger_config").$type<Record<string, number | string>>().notNull().default({}),
    steps: jsonb("steps").$type<AutomationStep[]>().notNull().default([]),
    status: text("status").$type<"draft" | "live">().notNull().default("draft"),
    runs: integer("runs").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId, t.trigger)],
);

export type RunLogEntry = { at: string; step: number; ok: boolean; detail: string };

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    /** Dedupes a trigger firing twice for the same thing, e.g. "order:<id>". */
    triggerKey: text("trigger_key").notNull(),
    step: integer("step").notNull().default(0),
    status: text("status").$type<"running" | "waiting" | "done" | "stopped" | "failed">().notNull().default("running"),
    log: jsonb("log").$type<RunLogEntry[]>().notNull().default([]),
    /** Details from the trigger, e.g. order_number or cart_url, for messages to use. */
    vars: jsonb("vars").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("automation_runs_key_idx").on(t.automationId, t.triggerKey),
    index().on(t.orgId, t.createdAt),
  ],
);

// ---------- AI replies ----------

export const aiSettings = pgTable("ai_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  businessInfo: text("business_info").notNull().default(""),
  faqs: text("faqs").notNull().default(""),
  includeCatalog: boolean("include_catalog").notNull().default(true),
  /** Hand to a person when the customer says any of these. */
  handoverKeywords: text("handover_keywords").array().notNull().default(["human", "agent", "person", "call me"]),
  /** Hand over after this many AI replies in one conversation. */
  maxReplies: integer("max_replies").notNull().default(6),
});

// ---------- developer API ----------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scope: text("scope").$type<"full" | "read">().notNull().default("full"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash), index().on(t.orgId)],
);

export const WEBHOOK_EVENTS = [
  "message.received",
  "message.status",
  "conversation.started",
  "contact.created",
  "lead.created",
  "order.created",
  "order.paid",
  "order.updated",
  "appointment.booked",
  "appointment.cancelled",
  "cart.abandoned",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secretEnc: text("secret_enc").notNull(),
    events: text("events").array().$type<WebhookEvent[]>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"pending" | "ok" | "failed">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseCode: integer("response_code"),
    error: text("error"),
    createdAt: createdAt(),
    deliveredAt: ts("delivered_at"),
  },
  (t) => [index().on(t.endpointId, t.createdAt), index().on(t.orgId, t.createdAt)],
);

// ---------- uploaded files ----------

export const files = pgTable(
  "files",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    /** "local:<path>" in dev, or a Vercel Blob URL. */
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.createdAt)],
);

/** Who has a conversation open right now, for the inbox collision indicator. */
export const presence = pgTable(
  "presence",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    typing: boolean("typing").notNull().default(false),
    seenAt: ts("seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

/** Fixed-window request counters, shared by every server instance. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] }), index().on(t.windowStart)],
);

/** Sends new chats to the right person by what the customer wrote or the language they wrote in. */
export const routingRules = pgTable(
  "routing_rules",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    match: text("match").$type<"keyword" | "language">().notNull(),
    /** Keywords, or language codes like "hi" and "ml". */
    values: text("values").array().notNull(),
    /** Who gets it: one teammate, or whichever eligible teammate has the fewest open chats. */
    assignMode: text("assign_mode").$type<"user" | "least_busy" | "none">().notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    label: text("label"),
    active: boolean("active").notNull().default(true),
    hits: integer("hits").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.position)],
);


/** Shopify checkouts that may become abandoned carts. */
export const abandonedCarts = pgTable(
  "abandoned_carts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    source: text("source").$type<StoreKind>().notNull(),
    /** The checkout token; the order that completes it carries the same token. */
    externalId: text("external_id").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    url: text("url"),
    totalMinor: integer("total_minor").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    acceptsMarketing: boolean("accepts_marketing").notNull().default(false),
    completedAt: ts("completed_at"),
    remindedAt: ts("reminded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("abandoned_carts_org_source_ext_idx").on(t.orgId, t.source, t.externalId)],
);

/** A saved filter over contacts, used as a live audience for broadcasts. */
export type SegmentCondition =
  | { field: "tag"; op: "has" | "lacks"; value: string }
  | { field: "source"; op: "is" | "is_not"; value: string }
  | { field: "custom"; op: "equals" | "contains" | "is_set" | "is_empty"; key: string; value?: string }
  | { field: "last_message"; op: "within_days" | "older_than_days" | "never"; days?: number }
  | { field: "created"; op: "within_days" | "older_than_days"; days: number }
  | { field: "opted_out"; op: "yes" | "no" }
  | { field: "paid_order"; op: "any" | "none" | "within_days"; days?: number };

export type SegmentRules = { match: "all" | "any"; conditions: SegmentCondition[] };

export const segments = pgTable(
  "segments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rules: jsonb("rules").$type<SegmentRules>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

export type SheetKind = "leads" | "appointments" | "orders" | "contacts" | "enquiries";

/** Appends new rows of one kind to a tab in the customer's Google Sheet, every minute. */
export const sheetSyncs = pgTable(
  "sheet_syncs",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SheetKind>().notNull(),
    spreadsheetId: text("spreadsheet_id").notNull(),
    tab: text("tab").notNull(),
    /** The last row sent: rows created after (cursorAt, cursorId) go next. */
    cursorAt: ts("cursor_at").notNull(),
    cursorId: uuid("cursor_id"),
    rowsSynced: integer("rows_synced").notNull().default(0),
    lastSyncedAt: ts("last_synced_at"),
    lastError: text("last_error"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sheet_syncs_org_kind_idx").on(t.orgId, t.kind)],
);

/** One row per developer API call, for the request log in Settings → Developers. */
export const apiRequests = pgTable(
  "api_requests",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    keyId: uuid("key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    /** The error code we answered with, if any. */
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.createdAt)],
);
