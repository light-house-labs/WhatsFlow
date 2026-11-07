# Architecture: WhatsFlow (a rebuild of Crawdle's core features)

Scope of this document: **Phase 1** (all `must` rows in `features.csv`, plus the
must-level fixes F1, F3, F4). Phases 2–3 are listed at the end.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript, Server Actions + route handlers | one codebase for UI, API, webhooks; deploys to Vercel as-is |
| styling | Tailwind v4, tokens in `src/app/globals.css` (from `replica/design/tokens.json`) | no raw hex in components |
| UI libs | lucide-react (icons), @dnd-kit (kanban), @xyflow/react (flow canvas) | open licences, accessible enough, no Crawdle assets |
| database | Postgres via Drizzle ORM. **Dev: PGlite** (embedded Postgres in `.data/`, no install, no account). **Prod: Neon/any Postgres** via `DATABASE_URL` | same SQL dialect in both, zero setup locally |
| migrations | drizzle-kit `generate`; applied by `src/db/migrate.ts` on boot | checked in, run by a script |
| auth | own: email + password (scrypt), DB sessions, http-only secure cookie | no third-party account needed; roles live in our DB anyway |
| WhatsApp | `WhatsAppProvider` interface: **CloudApiProvider** (Meta Graph API, user's own WABA + token) and **SandboxProvider** (local simulator, fake customer page `/sandbox`) | full app works with no Meta account; flip per number |
| payments | `BillingProvider` interface: **ManualProvider** in dev (instant plan changes); Razorpay/Stripe adapters in Phase 2 | plan gates + one-click cancel are ours, provider only moves money |
| jobs | `jobs` table (run_at, kind, payload, attempts) drained by `/api/cron/tick` (Vercel Cron every minute) and kicked inline after enqueue | campaigns, scheduled sends, follow-up reminders; no extra infra |
| realtime | client polling (2s) on inbox endpoints | works across serverless instances; SSE/WebSockets later |
| hosting | Vercel | default |

One database. No microservices.

## Schema

Source of truth: `src/db/schema.ts` (Drizzle). Tables: 27. Access rule:
**data-layer checks** — every query goes through `requireMember(orgId, role?)`
and filters by `org_id`. A second org's user must get nothing (tested).

| table | key columns | notes |
| --- | --- | --- |
| users | email unique, password_hash, name, phone | |
| sessions | token_hash unique, user_id, expires_at | cookie holds raw token, DB holds sha256 |
| orgs | name, industry, plan, plan_interval, billing_status, current_period_end, cancel_at_period_end | |
| memberships | (org_id,user_id) unique, role owner/admin/agent | seat limit by plan |
| invites | org_id, email, role, token_hash, accepted_at | |
| wa_numbers | org_id, provider (sandbox/cloud), phone_number_id, waba_id, display_phone, access_token (encrypted), verify_token, status, quality_rating, last_inbound_at, last_webhook_at | |
| contacts | (org_id, wa_id) unique, name, tags text[], custom_fields jsonb, owner_id, source, opted_out_at | |
| conversations | org_id, contact_id, number_id, status open/pending/closed, assignee_id, handled_by bot/human, labels text[], last_inbound_at, last_message_at, unread_count, waiting_since | 24h window = now − last_inbound_at < 24h |
| messages | conversation_id, direction, type, body, payload jsonb, wa_message_id unique (nullable), status queued/sent/delivered/read/failed, error, sender_kind, sender_user_id, template_id, campaign_id | idempotent on wa_message_id |
| notes | conversation_id, author_id, body | |
| quick_replies | org_id, shortcut, body | |
| templates | org_id, name, language, category, header/body/footer/buttons jsonb, status draft/pending/approved/rejected, meta_template_id, rejection_reason | |
| campaigns | org_id, name, template_id, audience jsonb, variable_map jsonb, scheduled_at, status, counters | |
| campaign_recipients | campaign_id, contact_id, message_id, status | |
| pipeline_stages | org_id, name, position, kind open/won/lost | seeded New, Contacted, Qualified, Proposal, Won, Lost |
| leads | org_id, contact_id, conversation_id, stage_id, title, value_cents, currency, owner_id, source, notes, next_follow_up_at | |
| enquiries | org_id, contact_id, conversation_id, topic, source, status answered_by_bot/needs_human/converted, converted_to | logged per new inbound thread |
| tickets | org_id, contact_id, conversation_id, subject, status, priority, assignee_id, due_at, resolved_at | |
| bot_flows | org_id, name, trigger jsonb, graph jsonb, status draft/live | |
| flow_runs | flow_id, conversation_id, current_node, vars jsonb, status | |
| inbox_settings | org_id pk, business_hours jsonb, timezone, welcome_msg, away_msg, wait_alert_minutes | |
| jobs | kind, payload jsonb, run_at, attempts, locked_until, done_at, error | |
| webhook_events | provider, external_id unique, payload, received_at | raw inbound log + dedupe |
| support_threads | org_id, user_id, status | F3 "talk to a person" |
| support_messages | thread_id, from_staff, body | |
| billing_events | org_id, kind, detail jsonb | audit of plan changes / cancels |
| audit_log | org_id, actor_id, action, target, meta | (Phase 3 UI, table now) |

Money: integer minor units + currency. Times: `timestamptz`, UTC.

## API

Server Actions handle all form mutations (auth, settings, CRUD). Route handlers:

| method path | does | who | flow |
| --- | --- | --- | --- |
| GET /api/webhooks/whatsapp | Meta verify challenge (hub.verify_token per number) | Meta | F01 |
| POST /api/webhooks/whatsapp | inbound messages + statuses; verify `X-Hub-Signature-256` with app secret; dedupe by message id | Meta | F02 |
| POST /api/sandbox/inbound | simulated customer message | dev / sandbox numbers | F02 |
| GET /api/inbox/conversations | list for polling (filters) | member | F03 |
| GET /api/inbox/conversations/:id/messages | thread for polling | member | F03 |
| POST /api/inbox/conversations/:id/messages | send reply / template | member | F03 |
| GET /api/cron/tick | drain jobs (Bearer CRON_SECRET) | Vercel Cron | F11 |
| GET /api/doctor/:numberId | connection checklist | admin | F4 |

Webhooks out (customer endpoints) and public REST API are Phase 2.

Jobs: `campaign.send` (batches of 50, throttled), `campaign.scheduled`,
`lead.followup` (reminder note), `template.sync` (poll Meta status).

## The parts that bite

- **Idempotency**: Meta retries webhooks; `webhook_events.external_id` + `messages.wa_message_id` unique; statuses only move forward (sent→delivered→read; failed terminal).
- **24h window**: free-form replies blocked outside it; composer switches to template mode.
- **Ordering**: Meta can deliver statuses before our send returns; upsert by wa_message_id.
- **Races**: two agents assigning — last write wins but shown live; drag-drop stage change is a single UPDATE.
- **Rate limits**: Cloud API ~80 msg/s; campaign sender throttles to 20/s per number and respects messaging tier.
- **Time zones**: business hours evaluated in the org's IANA timezone.
- **Secrets**: WA access tokens encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`).
- **Multi-tenancy**: every table has org_id; every query filtered; tested with 2 orgs.
- **GDPR / exit**: export + delete (F2, Phase 2) — schema keeps it simple (cascade on org).

## Build order

1. **Vertical slice**: sign up → create workspace → sandbox number auto-connected → customer messages from `/sandbox` → welcome message → appears in inbox → agent replies → customer sees it.
2. **Must-haves**: contacts + CSV import, labels/notes/quick replies/assign, enquiries, pipeline kanban, tickets, templates (sandbox auto-approve, Cloud submit), campaigns, bot flow builder + runtime + handover, team invites + roles + seat limits, plans + gates, dashboard, inbox rules.
3. **Fixes**: F1 one-click cancel + honest downgrade, F3 talk-to-a-person, F4 connection doctor.
4. **Phase 2 (should)**: catalog, orders, payments links, appointments, automations, AI agent, analytics, Sheets/Shopify/Woo, API + webhooks, F2/F5/F6/F7.
5. **Phase 3 (could)**: white label, CRM connectors, audit UI, CTWA, mobile.
