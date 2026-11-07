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
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_contact_number_idx").on(t.contactId, t.numberId),
    index().on(t.orgId, t.lastMessageAt),
    index().on(t.assigneeId),
  ],
);

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
    headerText: text("header_text"),
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

export type Audience = { tags?: string[]; contactIds?: string[]; all?: boolean };

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
