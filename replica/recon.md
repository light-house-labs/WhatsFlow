# Recon map: Crawdle (web app)

Scope: full parity — every module on crawdle.com (inbox, bots, AI agent, enquiries,
pipeline, contacts, tickets, catalog, orders, payments, appointments, campaigns,
templates, automations, integrations, API/webhooks, analytics, roles, white label)
For: WhatsFlow — the user's own WhatsApp CRM product to sell
Date: 2026-11-07

Method: public pages only. `app.crawdle.com/*` is a login wall (checked
`/pipeline`), so no screen was seen from inside. Every screen below is inferred
from marketing copy, product-screen captions, pricing gates and the WhatsApp
Cloud API's own model. Treat layouts as **guesses**; treat features as
**evidenced** where a source row is cited.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site (home) | https://www.crawdle.com/ | hero, modules, 6 product-screen captions, industries, FAQ |
| 2 | pricing + comparison table | https://www.crawdle.com/#pricing | Growth ₹2,999 / Scale ₹5,999 / Enterprise; feature gates |
| 3 | features page | https://www.crawdle.com/features.html | most complete feature list: inbox, broadcasts, templates, bots, booking, pipeline, contacts, automations, integrations, API, webhooks, analytics |
| 4 | white label page | https://www.crawdle.com/white-label.html | partner portal, branding, client accounts, earnings calculator |
| 5 | sign up page | https://app.crawdle.com/signup | name, email, phone (+CC), password, terms, marketing opt-in |
| 6 | log in page | https://app.crawdle.com/login | email-or-username + password, forgot password |
| 7 | WhatsApp Cloud API docs (Meta, public) | https://developers.facebook.com/docs/whatsapp/cloud-api | data model for messages, templates, statuses, webhooks, 24h window, interactive messages, Embedded Signup |
| — | help center / changelog / app store / walkthrough videos | not found | no public help docs or mobile listing located; a gap to fill later |
| — | user's own account | not used | none exists; if one is created, check Crawdle's terms for competitive-use clauses first |

## Core loop

A business connects its WhatsApp number, customers message it, a bot answers and
qualifies them instantly, and the team picks up the conversation in a shared
inbox and turns it into a lead, booking, order or ticket.

## Screens

Routes are proposals for WhatsFlow, not Crawdle's (only six of theirs are known:
`/enquiries /pipeline /catalog /orders /tickets /campaigns`).

### Auth and onboarding

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign up | /signup | create account | text inputs, phone input with country code, password, 2 checkboxes, button | filled (src 5); need empty, error, loading |
| S02 | Log in | /login | sign in | email-or-username, password, link to forgot/sign up | filled (src 6) |
| S03 | Forgot / reset password | /forgot-password | reset | email input, confirmation | guess |
| S04 | Onboarding: connect WhatsApp number | first run after sign up | link a WhatsApp Business number via Meta Embedded Signup | stepper, Meta popup button, number status card | guess; states: not connected, pending verification, connected, failed |
| S05 | Onboarding: workspace setup | first run | business name, industry, invite team, pick starter flow | stepper, industry picker, invite list | guess (industries from src 1) |

### Talk to customers

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S06 | Team inbox | /inbox | shared WhatsApp inbox | 3-pane: chat list (filters, search, unread), conversation (bubbles, statuses, composer with templates/quick replies/attachments), contact sidebar; assignee picker; labels; internal notes; "waiting too long" alert; bot/human badge | src 3; need empty, no-number-connected, 24h-window-closed (template only), mobile |
| S07 | Enquiries | /enquiries | log of every inbound question with source and status, bot-replied or not | table, source + status chips, filters | src 1 caption "Replied in 3 seconds" |
| S08 | Contacts list | /contacts | all customers, auto-saved | table, tag filters, search, bulk tag, import/export buttons | src 3 |
| S09 | Contact profile | /contacts/:id | one customer | header (phone, location, tags, owner), custom fields, order count/total/last order, birthday, activity timeline, chats, orders | src 3 |
| S10 | Contact import | /contacts/import | upload spreadsheet / CRM import | file drop, column mapper, preview, result report | src 3; need error rows state |
| S11 | Segments | /contacts/segments | saved audiences by tags/labels/fields | rule builder, count preview | src 3 |

### Sell and book

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S12 | Pipeline board | /pipeline | leads by stage | kanban columns (custom stages New→Won/Lost), cards (value, owner, next follow-up), drag and drop, filters by source/owner | src 1, 3 |
| S13 | Lead detail | drawer on S12 | edit one lead | deal value, owner, stage, notes, next follow-up date, source, linked chat | src 3 |
| S14 | Pipeline settings | /settings/pipeline | edit stages | sortable list | src 3 "customizable stages" |
| S15 | Catalog | /catalog | product list | grid/table, price, stock, image, active toggle; plan limit banner (5 on Growth) | src 1, 2 |
| S16 | Product editor | /catalog/:id | create/edit product | image upload, name, description, price, currency, stock, variants (guess) | guess |
| S17 | Orders | /orders | orders with payment and delivery status | table, status chips (placed, paid, shipped, delivered, cancelled — guess), source (chat/Shopify/Woo) | src 1, 2 |
| S18 | Order detail | /orders/:id | one order | items, totals, payment link + status, delivery updates timeline, "send update" | guess |
| S19 | Appointments calendar | /appointments | daily view of bookings | day/week calendar, by staff/branch filter, booking cards | src 3 |
| S20 | Booking setup | /appointments/settings | services, staff, branches, hours | lists + editors, weekly hours grid, reminder timing | src 3 |
| S21 | Tickets | /tickets | support requests with status and assignee | table/board, status, assignee, SLA timer, attachments (photo) | src 1, 2 |
| S22 | Ticket detail | /tickets/:id | resolve one ticket | linked chat, order, photo, status, assignee, internal notes | src 1 caption "Resolved in 6 minutes" |

### Campaigns and templates

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S23 | Campaigns list | /campaigns | all broadcasts | table, status (draft, scheduled, sending, sent), delivered/read/replied | src 1, 3 |
| S24 | Campaign composer | /campaigns/new | build a broadcast | audience (labels/tags/segment/upload), template picker, variable mapping, preview phone, send now / schedule, cost estimate (guess) | src 3 |
| S25 | Campaign report | /campaigns/:id | results | funnel (sent→delivered→read→replied), failures list, opt-outs | src 3 |
| S26 | Templates library | /templates | approved message templates | table: name, category (Marketing/Utility/Authentication), language, status (Approved/Pending/Rejected) | src 3 |
| S27 | Template editor | /templates/new | create + submit to Meta | header (text/image/document/video), body with {{n}} variables, footer, buttons (quick reply/URL/phone), live preview, sample values | src 3 |

### Automate

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S28 | Bot flows list | /bots | all flows | cards with status (Draft/Live), trigger, runs; plan limit (3 on Growth); "start from template" | src 3 |
| S29 | Flow builder | /bots/:id | drag-and-drop chatbot | canvas, nodes: trigger, send message, buttons, list, question (save to field), condition, look up data (order status, catalog), offer booking slots, AI reply, assign to agent/handover; test panel; publish | src 3 |
| S30 | AI agent settings | /ai-agent | train AI replies on business details | knowledge sources (text, FAQs, files, catalog), tone, handover rules, on/off per hours, test chat | src 2, 3 |
| S31 | Automations list | /automations | rules | list with trigger, status, runs this month | src 3 |
| S32 | Automation builder | /automations/:id | When → Then → Wait → If | step builder; triggers: new chat, new order, payment, sheet row, CRM event; actions: send template, assign, tag, create lead/ticket, webhook | src 3 |
| S33 | Automation run log | /automations/:id/runs | every run | table: time, contact, steps, result | src 3 |
| S34 | Inbox rules | /settings/inbox | welcome + away messages, business hours, routing by topic/language, quick replies, labels, wait-time alert threshold | forms, lists | src 3 |

### Connect, measure, admin

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S35 | Integrations | /integrations | connected apps | cards: Shopify, WooCommerce, Google Sheets, Stripe, Meta Ads (CTWA), Zoho, HubSpot, Pipedrive, Salesforce, monday.com, Dynamics 365; "4 of 6 on" counter; plan gates | src 1, 3 |
| S36 | Integration config | /integrations/:app | connect + choose what syncs | OAuth/API-key connect, sync toggles, direction, last sync, errors | src 3 |
| S37 | API keys | /developers/api-keys | create keys with roles | table, create modal (show once), revoke; usage + error charts | src 3 |
| S38 | Webhooks | /developers/webhooks | endpoint + events | URL, secret, event checklist, status (Active), delivery log with retries | src 3 |
| S39 | Analytics | /analytics | team + campaign + sales reports | date range, team filter, KPI tiles (first reply time, chats handled, sales from WhatsApp), daily chart, teammate/source comparison, export | src 3 |
| S40 | Dashboard home | /dashboard | at-a-glance | revenue, read rates, bot vs team handled, reply time (src 4) | src 1 hero, 4 |
| S41 | Team and roles | /settings/team | members, invites, roles, seat limit | table, invite modal, role picker | src 2, 3 |
| S42 | Audit log | /settings/audit-log | who did what | filterable table | src 2 (Scale) |
| S43 | WhatsApp number settings | /settings/whatsapp | number, display name, profile (about, logo, address), quality rating, messaging limit tier | forms, status badges | guess (Cloud API) |
| S44 | Billing and plan | /settings/billing | plan, seats, usage, invoices, Meta message spend | plan cards, monthly/yearly toggle, usage bars | src 2 |
| S45 | Profile and notifications | /settings/profile | own account, alert prefs | forms | guess |
| S46 | Data export | /settings/export | export contacts, chats, reports | buttons, job status | src 2 (Scale) |

### White label (partner side)

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S47 | Partner dashboard | /partner | clients, revenue | KPI tiles, client table (plan, price, status) | src 4 |
| S48 | Create client account | /partner/clients/new | provision a workspace for a client | form: business, admin email, plan, price | src 4 |
| S49 | Partner branding | /partner/branding | logo, colours, custom domain, email sender | uploader, colour pickers, domain + DNS instructions + verification status | src 4 |
| S50 | Branded login | custom domain /login | client sign-in under partner brand; WhatsApp OTP or email+password | same as S02, themed | src 4 |

### Customer-facing (inside WhatsApp, not web screens)

| ID | surface | purpose |
| --- | --- | --- |
| W01 | Bot conversation | buttons (max 3), list messages (max 10 rows), questions |
| W02 | Booking in chat | pick service → staff → slot → confirm; reschedule/cancel buttons; reminders |
| W03 | Catalog + order in chat | product messages, cart, order confirmation |
| W04 | Payment link | Stripe/Razorpay link, paid confirmation |
| W05 | Opt-out | one-tap "Stop" button on marketing |
| W06 | Click-to-chat entry | wa.me link / QR / CTWA ad with prefilled text |

Totals: 50 web screens, 6 in-WhatsApp surfaces.

## Flows

```
F01 Business signs up and goes live
    S01 sign up -> S04 connect number (Meta Embedded Signup popup) -> S05 workspace setup -> S28 pick industry template flow -> publish -> S06 inbox
    happy path clicks: ~12 (Crawdle claims "live within a day")
    edge: Meta business verification pending, number already on WhatsApp app, display name rejected, popup blocked, user abandons midway
```

```
F02 Customer messages, bot answers, human takes over
    W06 entry -> W01 bot flow -> (answer | capture lead | handover) -> S06 inbox shows conversation assigned -> agent replies
    happy path clicks (agent): 2 (open chat, send)
    edge: message outside 24h window (template only), media message, unsupported type, two agents reply at once, bot and human both active, customer replies to old campaign
```

```
F03 Agent works the inbox
    S06 filter "unassigned" -> open chat -> assign self -> quick reply / template -> add label + note -> close
    happy path clicks: 6
    edge: chat waited too long alert, reassign, internal note vs reply confusion, mobile width, delivery failed status
```

```
F04 Chat becomes a lead and moves through pipeline
    S06 "convert to lead" (or auto via bot) -> S12 card in New -> S13 set value, owner, follow-up -> drag to Won
    happy path clicks: 5
    edge: duplicate lead for same contact, follow-up reminder fires, lead with no owner, stage deleted with leads in it
```

```
F05 Enquiry logged and answered
    inbound question -> bot/AI answer -> S07 row with source + status (answered by bot | needs human)
    edge: AI unsure -> handover; enquiry converts to lead or ticket
```

```
F06 Support ticket resolved
    S06 "create ticket" (or bot) -> S21 open, assignee -> S22 with photo + order linked -> resolve -> customer notified
    happy path clicks: 5
    edge: SLA breached, reopened by customer reply, ticket on deleted contact
```

```
F07 Customer books an appointment in WhatsApp
    W02 pick service -> staff/branch -> slot -> confirm -> template confirmation -> reminder before -> S19 calendar shows it
    happy path taps (customer): 4
    edge: slot taken mid-flow, no slots this week, timezone, reschedule/cancel, Growth limit 250 reached, staff off day
```

```
F08 Customer orders from catalog and pays
    W03 browse product -> add/order -> W04 payment link -> paid webhook -> S17 order "paid" -> automation sends shipping + delivery updates
    edge: payment failed/expired link, out of stock, Growth plan (orders without payments), duplicate payment webhook
```

```
F09 Shopify/Woo order triggers WhatsApp updates
    S36 connect store -> order created in store -> S17 order synced -> S32 automation sends confirmation template -> Wait until shipped -> send tracking
    edge: customer phone missing/invalid, abandoned cart reminder, store disconnected, template not approved
```

```
F10 Create and approve a template
    S27 fill header/body/buttons + samples -> submit to Meta -> S26 Pending -> Approved | Rejected (reason)
    happy path clicks: 6
    edge: rejection, category recategorized by Meta, paused for low quality
```

```
F11 Send a broadcast campaign
    S24 audience (tag/segment/upload) -> template -> map variables -> preview -> schedule -> S23 scheduled -> sending -> S25 report
    happy path clicks: 7
    edge: opted-out contacts excluded, messaging tier limit hit, invalid numbers, replies land in S06, cancel scheduled
```

```
F12 Build and publish a bot flow
    S28 new / from template -> S29 add nodes, connect -> test -> publish (Live)
    edge: loop in graph, dangling node, Growth limit 3 flows, two flows same trigger, editing a live flow with users mid-run
```

```
F13 Set up an automation
    S31 new -> S32 When (new order) -> Then (send template) -> Wait (until shipped) -> If (no reply in 3 days) -> Then (assign) -> activate -> S33 runs
    edge: wait outlives contact deletion, trigger floods, retries
```

```
F14 Developer uses API and webhooks
    S37 create key -> POST /v1/messages -> status accepted -> S38 webhook message.read delivered with retry on 503
    edge: revoked key, rate limit, endpoint down for hours, signature verify
```

```
F15 Owner invites team and sets roles
    S41 invite -> email -> accept -> role (owner/admin/agent) -> S06 sees only allowed chats
    edge: seat limit reached, remove member with open chats
```

```
F16 Owner reviews performance
    S39 date range + team filter -> compare teammates/sources -> export
```

```
F17 Partner resells under own brand
    S49 logo/colours/domain -> DNS verify -> S48 create client -> client logs in at S50 -> S47 revenue
    edge: domain not verified, client over plan limits, partner suspends client
```

```
F18 Upgrade plan
    plan limit banner (flows/catalog/seats) -> S44 choose Scale -> checkout -> limits lifted
    edge: downgrade with data over limit, failed renewal
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, icon | default, hover, focus, disabled, loading | all |
| Text input / textarea | text, email, password, search, phone (with country code) | default, focus, error, disabled | S01–S03, forms |
| Select / combobox | single, multi, searchable (assignee, tags) | open, empty, loading | S06, S12, S24 |
| Checkbox / toggle / radio | — | on, off, disabled | settings, S35 |
| Tag / label chip | colours, removable | — | S06, S08, S09 |
| Status badge | draft, live, scheduled, sent, approved, pending, rejected, paid, open, resolved | — | most lists |
| Data table | sortable, selectable rows, bulk actions, pagination | empty, loading skeleton, error | S07, S08, S17, S21, S23, S26 |
| Kanban board + card | — | dragging, drop target, empty column | S12, S21 (board view) |
| Drawer / side panel | right | open, closed | S13, S06 sidebar |
| Modal / dialog | confirm, form | — | invites, keys, deletes |
| Chat list item | unread, assigned, bot, waiting-alert | selected | S06 |
| Message bubble | in, out, note (internal), system; text, image, document, audio, video, location, buttons, list, template, product, order | sending, sent, delivered, read, failed | S06, S29 test, S27 preview |
| Composer | free text, template mode (window closed), quick replies `/`, attachments, emoji | disabled outside 24h | S06 |
| Phone preview | WhatsApp-style mock | — | S24, S27, S29 |
| Flow canvas + node | trigger, message, buttons, list, question, condition, lookup, booking, AI, handover | selected, error, connecting | S29 |
| Step builder | When / Then / Wait / If | — | S32 |
| Calendar | day, week; by staff/branch | empty, busy | S19 |
| Weekly hours grid | — | — | S20, S34 |
| Stat tile + chart | KPI, line, bar, funnel | loading, no data | S25, S39, S40, S47 |
| Date range picker | presets (7d, 30d), custom | — | S39, S25 |
| File upload / dropzone | image, CSV | uploading, error | S10, S16, S27, S49 |
| Column mapper | — | — | S10 |
| Segment rule builder | — | — | S11, S24 |
| Plan limit banner | — | — | S15, S28, S41 |
| Toast | success, error, info | — | all |
| Empty state | per module | — | all lists |
| App shell | sidebar nav, top bar (number status, notifications, user menu), mobile bottom nav | collapsed | all |

## Inferred data model

```
Organization (workspace)  id, name, industry, plan, partner_id?, brand settings
         evidence: S05, src 2, src 4      confidence: high

User     id, name, email, phone, password_hash, marketing_opt_in
         evidence: S01 fields              confidence: high

Membership  user_id, org_id, role (owner | admin | agent | custom), invited_at
         evidence: src 2 "roles, permissions", seat limits     confidence: medium

WhatsAppNumber  id, org_id, waba_id, phone_number_id, display_phone, display_name,
         quality_rating, messaging_limit_tier, status, access_token (encrypted)
         evidence: src 7 Cloud API, S04       confidence: high (shape from Meta)

Contact  id, org_id, wa_id (phone E.164), name, location, birthday, owner_id,
         source (whatsapp | ad | website | import | shopify), ad_referral (json),
         opted_out_at, custom_fields (json), order_count, order_total, last_order_at
         evidence: src 3 contact profile      confidence: high

Tag / Label  id, org_id, name, colour; ContactTag, ConversationLabel joins
         evidence: src 3                       confidence: high

CustomFieldDef  id, org_id, key, type        confidence: medium

Conversation  id, org_id, number_id, contact_id, status (open | pending | closed),
         assignee_id, handled_by (bot | human), active_flow_run_id,
         last_inbound_at (24h window), first_response_at, waiting_since
         evidence: src 3 inbox, src 7 window      confidence: high

Message  id, conversation_id, direction (in | out), type, body/payload (json),
         wa_message_id (unique), status (queued | sent | delivered | read | failed),
         error_code, sender (contact | user_id | bot | automation | campaign | api),
         template_id?, campaign_id?, created_at
         evidence: src 7                       confidence: high

Note     id, conversation_id, author_id, body   evidence: src 3   confidence: high
QuickReply  id, org_id, shortcut, body          evidence: src 3   confidence: high

Template  id, org_id, number/waba, name, language, category (marketing | utility |
         authentication), components (json), status (pending | approved | rejected |
         paused), rejection_reason, meta_template_id
         evidence: src 3, src 7                confidence: high

Segment  id, org_id, name, rules (json)        evidence: src 3   confidence: medium

Campaign  id, org_id, name, template_id, variable_map (json), audience (json),
         scheduled_at, status (draft | scheduled | sending | sent | cancelled),
         counts (sent, delivered, read, replied, failed)
         evidence: src 3                       confidence: high
CampaignRecipient  campaign_id, contact_id, message_id, status   confidence: high

PipelineStage  id, org_id, name, position, kind (open | won | lost)   confidence: high
Lead     id, org_id, contact_id, conversation_id?, stage_id, value_cents, currency,
         owner_id, source, notes, next_follow_up_at, won_at/lost_at
         evidence: src 3 "deal value, owner, notes, next follow-up"   confidence: high

Enquiry  id, org_id, contact_id, conversation_id, topic, source, status
         (answered_by_bot | needs_human | converted), converted_to (lead | ticket | order)
         evidence: src 1 "logged with source and status"   confidence: medium (may be a view over conversations — guess)

Ticket   id, org_id, contact_id, conversation_id, order_id?, subject, status
         (open | pending | resolved | closed), priority, assignee_id, due_at, resolved_at
         evidence: src 1, 2                    confidence: medium

Product  id, org_id, name, description, price_cents, currency, stock, image_url,
         active, external_id (shopify/woo), retailer_id (Meta catalog)
         evidence: src 1, 2                    confidence: medium
Order    id, org_id, contact_id, source (chat | shopify | woo | api), status
         (placed | paid | shipped | delivered | cancelled | refunded — guess),
         total_cents, currency, external_id, tracking_url
OrderItem  order_id, product_id, qty, price_cents
Payment  id, org_id, order_id, provider (stripe | razorpay), link_url, status,
         provider_ref, paid_at
         evidence: src 3 Stripe links          confidence: medium

Branch   id, org_id, name, address, timezone   evidence: src 3 "branch"   confidence: medium
StaffMember  id, org_id, user_id?, name, branch_id   confidence: medium
Service  id, org_id, name, duration_min, price?, buffer_min   confidence: medium
Availability  staff_id, weekday, start, end; TimeOff   confidence: guess
Appointment  id, org_id, contact_id, service_id, staff_id, branch_id, start_at,
         end_at, status (confirmed | rescheduled | cancelled | no_show),
         reminder_sent_at
         evidence: src 3 booking               confidence: high

BotFlow  id, org_id, name, trigger (json), graph (json nodes+edges), status
         (draft | live), version, from_template
FlowRun  id, flow_id, conversation_id, current_node, vars (json), status
         evidence: src 3 builder               confidence: medium

AIAgent  org_id, enabled, instructions, tone, handover_rules (json)
KnowledgeSource  id, org_id, type (text | faq | file | url | catalog), content, embedding status
         evidence: src 2, 3 "trained on your business details"   confidence: medium

Automation  id, org_id, name, trigger (json), steps (json: then/wait/if), status, runs_count
AutomationRun  id, automation_id, contact_id, step_index, status, resume_at, log (json)
         evidence: src 3 When/Then/Wait/If, run log   confidence: high

BusinessHours / InboxSettings  org_id, hours (json), welcome_msg, away_msg,
         wait_alert_minutes, routing_rules (json)   evidence: src 3   confidence: high

Integration  id, org_id, provider, credentials (encrypted), sync_settings (json),
         status, last_synced_at, error
         evidence: src 1, 3                    confidence: high

ApiKey   id, org_id, name, prefix, hash, role/scopes, last_used_at, revoked_at
ApiRequestLog  key_id, path, status, at        evidence: src 3   confidence: high
WebhookEndpoint  id, org_id, url, secret, events[], status
WebhookDelivery  id, endpoint_id, event, payload, attempts, last_status, next_retry_at
         evidence: src 3 retries 503→200       confidence: high

AuditLog id, org_id, actor_id, action, target, meta, at   evidence: src 2   confidence: medium

Subscription  org_id, plan (growth | scale | enterprise), interval (month | year),
         seats, status, provider_ref; limits derived from plan
         evidence: src 2                       confidence: high

Partner  id, name, brand (logo, colours), custom_domain, domain_verified, email_sender
PartnerClient  partner_id, org_id, price_cents, currency, status
         evidence: src 4                       confidence: medium
```

Relationships: Organization 1-n Membership n-1 User; Organization 1-n
WhatsAppNumber; Organization 1-n Contact 1-n Conversation 1-n Message;
Contact 1-n Lead / Ticket / Order / Appointment; Lead n-1 PipelineStage;
Campaign 1-n CampaignRecipient n-1 Contact; Campaign n-1 Template;
BotFlow 1-n FlowRun n-1 Conversation; Automation 1-n AutomationRun;
Order 1-n OrderItem n-1 Product; Order 1-n Payment; Partner 1-n PartnerClient 1-1 Organization.

## Feature matrix

See `features.csv`. 150 rows. Must: 55, should: 67, could: 22, skip: 6
(parity.py counts 140 — it leaves out `skip` rows and the 4 rows marked
`original=no`, which are our own additions).

## Out of scope (cannot or should not be cloned)

- **Meta Tech Provider status** — not a feature; WhatsFlow must apply to Meta itself (business verification + app review for Embedded Signup). Until then, onboarding is manual (user pastes WABA ID + token) or via a BSP.
- **Crawdle's template library and industry flow templates content** — write our own.
- **Trustpilot rating / reviews, customer base** — their network.
- **Partner contracts, pricing deals, sales kits** — business, not product.
- **Meta conversation pricing** — Meta's; we only pass it through.
- **Human services** (free consultation, custom builds, success managers, hand-held onboarding) — service offerings, not software.

## Size

Screens 50 (+6 in-WhatsApp surfaces), flows 18, entities ~40.

Hard parts:
1. **WhatsApp Cloud API onboarding** — Embedded Signup needs Meta Tech Provider approval; template approval lifecycle; 24h window; messaging tier limits; quality rating.
2. **Realtime inbox at scale** — webhook ingest with idempotency on `wa_message_id`, ordering, status updates, live push to many agents, assignment races.
3. **Flow builder + runtime engine** — visual canvas, a state machine that resumes per conversation, AI node with handover, versioning live flows.
4. **Automations with Wait/If** — durable scheduled jobs (days-long waits), retries.
5. **Integrations breadth** — Shopify, WooCommerce, Sheets, Stripe/Razorpay, Meta Ads, 6 CRMs, each with its own OAuth, sync and rate limits.
6. **Multi-tenant white label** — per-partner custom domains, theming, branded email, partner billing.

Size: **XL** — full parity is a multi-quarter build. Per this skill: rescope into
phases. Proposed phases (features.csv priority follows this):

- **Phase 1 (must, ~L)**: auth, number connect, inbox, contacts, templates, broadcasts, basic bot flows, enquiries, pipeline, tickets, team/roles, plan limits.
- **Phase 2 (should, ~L)**: catalog, orders, payments, appointments, automations, AI agent, analytics, Sheets/Shopify/Woo/Stripe, API + webhooks.
- **Phase 3 (could, ~M)**: white label, CRM connectors, audit log, CTWA ads, data export, mobile app.
