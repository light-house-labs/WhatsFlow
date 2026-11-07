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

## Connect a real WhatsApp number

Go to **Settings → WhatsApp numbers** and paste the Phone number ID, WhatsApp Business Account ID and a permanent System User token from your Meta app. WhatsFlow checks them with Meta before saving. Then set the callback URL `APP_URL/api/webhooks/whatsapp` and the verify token shown on that page in your Meta app, and subscribe to `messages`. The connection checklist on that page tells you what's wrong and how to fix it.

One-click *Embedded Signup* needs Meta Tech Provider approval for your own Meta app. Until then, use the manual connection.

## Deploy (Vercel)

- Add a Postgres database (for example Neon from the Vercel Marketplace) and set `DATABASE_URL`. Migrations in `drizzle/` run on first connection.
- Set `ENCRYPTION_KEY`, `META_APP_SECRET`, `APP_URL` and `CRON_SECRET`.
- `vercel.json` schedules `/api/cron/tick` every minute. That drains the job queue (broadcasts, template status, follow-ups, billing period ends). Per-minute cron needs a paid Vercel plan; on Hobby, schedule it daily and rely on the inline kicks that run after each action.

## What's in Phase 1, and what isn't

See `replica/features.csv` (scored by `python3 .claude/skills/replica-diff/parity.py replica/features.csv`).

**Built:** accounts, workspaces, roles, invites, sandbox and Cloud API numbers, a connection checklist, the shared inbox (assign, labels, notes, quick replies, 24-hour window, media by link), contacts with CSV import and opt-outs, enquiries, a drag-and-drop pipeline with follow-ups, tickets, templates with Meta submission, broadcasts with cost preview and tier limits, a visual bot builder with handover, welcome and away messages, a dashboard, plans with one-click cancel and honest downgrades, and in-app support.

**Not yet (Phase 2):** a real payment provider (billing is a manual provider, so no card is charged), catalog, orders, payments links, appointments, automations, the AI agent, analytics beyond the dashboard, Shopify/WooCommerce/Sheets integrations, the public API and outgoing webhooks, data export, and direct media upload.

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
