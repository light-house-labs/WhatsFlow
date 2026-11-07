# WhatsFlow

The honest WhatsApp CRM: a shared inbox, bot flows, broadcasts, enquiries, a sales pipeline and support tickets for businesses that sell and support on WhatsApp. Real people for support, and cancelling takes one click.

Built on the official **WhatsApp Cloud API**. Every workspace starts with a **sandbox number**, so the whole product works locally with no Meta account.

## Run it

```bash
npm install
npm run db:seed     # optional: demo workspace "Sunrise Dental" (run while the dev server is stopped)
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, data lives in an embedded Postgres (PGlite) under `.data/`. Delete that folder to start over. The seeded login is in `scripts/dev-account.ts`.

Try the core loop:

1. **Bot flows** → set *Welcome menu* live.
2. **Sandbox phone** → send `hi` as a customer, tap *Book a visit*, answer the question.
3. **Inbox** shows the chat. **Pipeline** shows the new lead.

## Tests

```bash
npm test            # unit + integration tests against in-memory Postgres
npm run lint
npm run build
```

## Configuration

Copy `.env.example` to `.env.local`.

| variable | what for |
| --- | --- |
| `DATABASE_URL` | Postgres for production (Neon or any Postgres). Empty means PGlite locally. |
| `ENCRYPTION_KEY` | Encrypts WhatsApp access tokens at rest. **Required in production.** |
| `APP_URL` | Public URL, used in invite links, reset emails and webhook instructions. |
| `META_APP_SECRET` | Verifies `X-Hub-Signature-256` on webhooks. **Required in production.** |
| `META_GRAPH_VERSION` | Graph API version, default `v23.0`. |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/tick`. |
| `RESEND_API_KEY`, `MAIL_FROM` | Password reset and cancellation emails. Without a key, emails print to the server log in development. |
| `SUPPORT_WHATSAPP` | Your support number (digits only) for the “Message us on WhatsApp” button. |
| `JOBS_INLINE` | `0` turns off the in-process job runner (it's off automatically on Vercel). |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | AI replies (Settings → AI replies). Default model `claude-opus-5-5`. Without a key the feature stays off. |
| `BLOB_READ_WRITE_TOKEN` | Stores uploads in Vercel Blob. Without it, uploads go to `.data/uploads` (fine locally, not on serverless). |
| `META_APP_ID`, `META_ES_CONFIG_ID` | Turn on the “Connect with Facebook” Embedded Signup button. |
| `PAYMENTS_SANDBOX` | `1` allows the test checkout page in production. Off by default; it's always on in development. |

## Connect a real WhatsApp number

Go to **Settings → WhatsApp numbers** and paste the Phone number ID, WhatsApp Business Account ID and a permanent System User token from your Meta app. WhatsFlow checks them with Meta before saving. Then set the callback URL `APP_URL/api/webhooks/whatsapp` and the verify token shown on that page in your Meta app, and subscribe to `messages`. The connection checklist on that page tells you what's wrong and how to fix it.

One-click *Embedded Signup* is built in: set `META_APP_ID`, `META_APP_SECRET` and `META_ES_CONFIG_ID` (the Embedded Signup configuration ID from your Meta app) and the page shows **Connect with Facebook**. It only works once your Meta app is approved as a Tech Provider, so it hasn't been tested against Meta yet. Until then, use the manual connection.

## Payments

Each workspace connects its own Razorpay or Stripe account in **Settings → Payments**. Payment links go to the customer in chat, and the provider's webhook (`APP_URL/api/webhooks/payments/<razorpay|stripe>/<workspace id>`, shown on that page) marks the order paid and messages the customer. Without a provider, development uses a test checkout page at `/pay/<order id>`.

This is separate from your own subscription billing, which still uses the manual provider (no card is charged).

## Developer API

Create keys in **Settings → API & webhooks** and send `Authorization: Bearer wf_live_…` to `APP_URL/api/v1`:

| method | path | |
| --- | --- | --- |
| GET, POST | `/contacts` | list (`?tag=`, `?q=`, `?before=` cursor) or upsert by phone |
| GET, PATCH | `/contacts/:id` | read, or change name, email, tags (`addTags`, `removeTags`), custom fields |
| GET | `/conversations` | `?status=`, `?contactId=` |
| GET | `/conversations/:id/messages` | newest first, cursor with `?before=` |
| POST | `/messages` | `{ "to": "+91…", "text": "…" }` inside the 24-hour window, or `{ "to", "template": { "name", "language", "variables" } }` |
| GET | `/messages/:id` | delivery status |
| GET | `/orders` | newest first |

Webhooks POST `{ id, event, createdAt, data }` with `X-WhatsFlow-Signature: sha256=<HMAC-SHA256 of "timestamp.body">` and `X-WhatsFlow-Timestamp`. Failed deliveries retry 6 times with backoff; the delivery log has a retry button. URLs that resolve to private addresses are refused in production.

## Deploy (Vercel)

- Add a Postgres database (for example Neon from the Vercel Marketplace) and set `DATABASE_URL`. Migrations in `drizzle/` run on first connection.
- Set `ENCRYPTION_KEY`, `META_APP_SECRET`, `APP_URL` and `CRON_SECRET`.
- `vercel.json` schedules `/api/cron/tick` every minute. That drains the job queue (broadcasts, template status, follow-ups, billing period ends). Per-minute cron needs a paid Vercel plan; on Hobby, schedule it daily and rely on the inline kicks that run after each action.

## What's built, and what isn't

See `replica/features.csv` (scored by `python3 .claude/skills/replica-diff/parity.py replica/features.csv`).

**Built:** accounts, workspaces, roles, invites, sandbox and Cloud API numbers, a connection checklist, the shared inbox (assign, labels, notes, quick replies, 24-hour window, media by link), contacts with CSV import and opt-outs, enquiries, a drag-and-drop pipeline with follow-ups, tickets, templates with Meta submission, broadcasts with cost preview and tier limits, a visual bot builder with handover, welcome and away messages, a dashboard, plans with one-click cancel and honest downgrades, and in-app support.

**Phase 2:** a product catalog with stock; orders from the inbox or a bot, with Razorpay or Stripe payment links, payment webhooks and status messages; appointments with services, capacity, hours, a day view, booking/rescheduling/cancelling inside WhatsApp and reminders; automations (when → wait → if → send/tag/assign) with an activity log; AI replies grounded in your business info, FAQs and catalog, with handover rules; analytics with date range, teammate and source breakdowns; the REST API and signed webhooks; file uploads; data export and workspace deletion; a “who's replying” indicator; tickets linked to orders; spreadsheet audiences for broadcasts; Embedded Signup (untested against Meta).

**Not yet:** subscription billing through a real provider, Shopify/WooCommerce/Google Sheets/CRM integrations, Meta catalog sync and native product messages, template media headers, testing a bot flow before publishing, industry starter flows, rate limits on the API, and a Playwright suite.

**Phase 3:** white label, CRM connectors, audit log UI, Click-to-WhatsApp ads and a mobile app.

## Layout

```
src/db/schema.ts          tables (Drizzle); migrations in drizzle/
src/lib/wa/               WhatsApp: providers (cloud, sandbox), inbound pipeline, outbound sends
src/lib/flows/            bot graph validation and runtime
src/lib/jobs.ts           job queue; handlers in job-handlers.ts
src/lib/billing.ts        plan changes, one-click cancel, period ends
src/app/(app)/            the product screens
src/app/api/              webhooks, inbox polling, sandbox, media proxy, cron
replica/                  recon, research, architecture and feature matrix behind this build
```
