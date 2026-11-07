# Fixes: what WhatsApp CRM users hate, and what WhatsFlow does instead

Date: 2026-11-07. Inputs: `replica/reviews.csv` (96 rows), `replica/feedback.md`,
themes in `replica/research/themes.json`.

## Sample, stated plainly

- **96 reviews.** 94 from Trustpilot (WATI 60, AiSensy 20, Interakt 14), 2 from Hacker News.
- **0 reviews of Crawdle.** Crawdle's homepage shows a Trustpilot badge (4.8, 120
  reviews), but there is no Trustpilot profile at `/review/crawdle.com` and a
  Trustpilot search for "crawdle" finds nothing. Unverified as of today. So this
  is **category research**: same buyers (Indian and global SMBs on the WhatsApp
  Business API), same features, same Meta constraints.
- **Skewed negative on purpose.** I read the 1–3 star pages first, then WATI's
  4-star page for "love it, but". Shares below are shares of this sample, not of
  all users. WATI has a 2.9 TrustScore across 276 reviews, 53% of them 5-star.
- **2 platforms, not 4.** `reviews.py` counts each Trustpilot company page as a
  separate source. Really it's Trustpilot plus HN. Reddit was blocked in the
  browser pane and Capterra showed a bot check, so I skipped both rather than
  get around them.
- False positives I checked by hand and ignored: "Teams and sharing" mostly
  matched "support team", and "Ads" matched noise.

## 1. What they hate

| # | problem | reviews | products | quotes |
| --- | --- | --- | --- | --- |
| 1 | **No human to talk to.** Support is a bot or an email that comes back in 2–3 days, even when the business is down | 51 | 3 | "If you send them an email today you'll hear back 2 days later." [link](https://www.trustpilot.com/reviews/6a0812289804e90d4dc5a11c) · "you get stuck with an AI chat bot forever" [link](https://www.trustpilot.com/reviews/692aade53a7300c768dc11ea) |
| 2 | **Easy to join, impossible to leave.** No cancel button, billed after cancelling, a downgrade that silently fails | 24 billing / 15 cancel | 3 | "HAVE A D*MN BUTTON FOR THAT." [link](https://www.trustpilot.com/reviews/6a20c00e488210e295d74fab) · "it shows on the app that it is cancelled and then today money was debited" [link](https://www.trustpilot.com/reviews/6ae08eaf1a8a87c93777ea94) · "the downgrade silently fails at the renewal date" [link](https://www.trustpilot.com/reviews/6a770a6b0caa405b44d0eb07) |
| 3 | **Refunds refused or turned into platform credit**, even with zero usage | 12 | 3 | "Even though I consumed 0 credits, they flatly refused to issue a refund" [link](https://www.trustpilot.com/reviews/697cab7f9d8fedad8232784d) · "they will not refund but will adjust your money in a future plan" [link](https://www.trustpilot.com/reviews/6aa408b82c380ae6968a76e9) |
| 4 | **Connecting the number is painful**, and when it fails nobody can diagnose why | 17 | 3 + HN | "Wati's dashboard consistently fails to show a successful connection" [link](https://www.trustpilot.com/reviews/6a4659f7f4db6a7ccf71fe4c) · "It receives the GET verification request but when I send a message to the number I never get the POST." [link](https://news.ycombinator.com/item?id=43792284) |
| 5 | **Sold features that don't work**, whether in docs, demos or sales calls | 12 | 3 | "key functionality simply did not work as documented" [link](https://www.trustpilot.com/reviews/6a917b30080424f59a292543) · "Their documentation clearly mentions this attribute, but it didn’t work." [link](https://www.trustpilot.com/reviews/68cbf8f4ea5433ebb2e05e28) |
| 6 | **Price feels high and opaque.** Extra credits, recharges, pricing not set per country | 20 price / 7 hidden | 3 | "important features required additional credits which were not clearly understood during onboarding" [link](https://www.trustpilot.com/reviews/69fc45d963395b8063e3d0c9) · "price could ve been country based" [link](https://www.trustpilot.com/reviews/694d3340f9ea7ae2c4ccbb34) |
| 7 | **WhatsApp number banned or blocked**, with the tool blamed and no warning | 7 | 2 | "My WhatsApp has been BLOCKED twice!" [link](https://www.trustpilot.com/reviews/65eff6c051eeb35ec1ea717f) · "can result in your whatsapp being blocked" [link](https://www.trustpilot.com/reviews/6ae24fd5de59185342760359) |
| 8 | **Unreliable app.** Downtime, random logouts, a broken mobile app (thin-ish) | 6 slow / 5 bugs | 2 | "The app logs out randomly, crashes frequently" [link](https://www.trustpilot.com/reviews/6912f7f2659f9ef5e26ee2f7) · "The mobile app does not work at all." [link](https://www.trustpilot.com/reviews/696fe8e4341fd830fc87c167) |

## 2. What is missing

| # | ask | reviews | quotes |
| --- | --- | --- | --- |
| 1 | **Self-serve cancel and exit**: cancel, delete, release the number and revoke Meta access without a ticket | 3 named explicitly, within the 15 cancel reviews | "To delete the account, release our telephone numbers and WABA, and remove WATI’s access from Meta, we had to create an external support ticket." [link](https://www.trustpilot.com/reviews/6a80978aaa14953adf49d84f) |
| 2 | **Downgrade that blocks or auto-disables what's over the limit**, never a surprise annual charge | 1 (detailed) | "Block the button immediately and display a clear error message" (same review as row 2 above) |
| 3 | **Bots that can do more than simple trees** (thin) | 3 | "these bots can be very simple and complex functions are not possible" [link](https://www.trustpilot.com/reviews/66d9390736b7ee1be7fefda4) |
| 4 | **Deeper analytics**: across campaigns, A/B tests (thin) | 2 | "run comparative studies and A/B testing within the tool" [link](https://www.trustpilot.com/reviews/66d9390736b7ee1be7fefda4) |
| 5 | **Template help**: AI that fixes templates so Meta approves them; a sane country picker (thin) | 2 | "They can integrate AI to help correcting message templates especially to enable easy approval process." [link](https://www.trustpilot.com/reviews/66d9390736b7ee1be7fefda4) |
| 6 | **Integrations that actually work** (Woo tracking, CRM sync) | 9 | "unreliable integrations that simply don’t work" [link](https://www.trustpilot.com/reviews/69df26fab27b8603e68bb75a) |

What people praise, so keep it at parity: shared team inbox, chat assignment,
tagging, fast broadcasts, segments, Google Sheets and HubSpot sync, an easy bot
builder, and a mobile app ([e.g.](https://www.trustpilot.com/reviews/695ccaedf38fa4150f6b0f58),
[e.g.](https://www.trustpilot.com/reviews/6a456180cdad30b6441e2bb0)).

## 3. What is unsolved

- **Businesses that cannot afford to lose their number.** Reviewers treat the
  number as the business, and nobody shows them the risk before it's gone (7
  reviews, 2 products). This makes a positioning point: number safety.
- **Small clinics whose "CRM" is WhatsApp scroll-back**, with family members
  messaging from other numbers about the same patient. Thin: 1 HN comment
  ([link](https://news.ycombinator.com/item?id=47621317)). Fits Crawdle's
  clinic vertical. Worth validating by talking to 5 clinics.
- **Buyers in one country selling into another** (a Dubai owner with an India
  business, pricing that isn't country-based). Thin: 2 reviews.

## 4. Fix plan

Ranked by evidence × cheapness. Each one is a row in `features.csv` with `original=no`.

| # | build | size | skill | evidence |
| --- | --- | --- | --- | --- |
| F1 | **One-click cancel and honest downgrade.** Cancel in Billing with no ticket and no chat. Email confirmation with the end date. Never charge after cancel (Stripe/Razorpay webhook check). A downgrade warns about each over-limit item and auto-pauses those items at period end | S | replica-backend, pricing → replica-launch | cancel 15, billing 24, 3 products |
| F2 | **Clean exit kit.** Export everything (CSV/JSON), a "disconnect number and revoke access" button that deregisters the webhook and drops tokens, and a written confirmation email | S | replica-backend | 6a80978a, 6922f26b |
| F3 | **Human support inside the app.** "Talk to a person" opens a WhatsApp chat with the WhatsFlow team (dogfooding). Target response time shown, in-app ticket status, public status page | S product + ops | replica-build, replica-deploy (status page) | human-support theme 51, 3 products |
| F4 | **Connection doctor.** A live checklist on S04/S43: token valid, number registered, webhook subscribed, last inbound event time, test message round trip. Every failure gets plain-language fix steps | M | replica-backend + replica-build | onboarding 17, HN webhook comment |
| F5 | **Number-safety guardrails.** Quality rating and messaging tier always visible. Warn before broadcasting to contacts with no inbound in 90+ days. Opt-out enforced. Auto-pause a campaign if the block rate spikes | M | replica-backend | ban 7, 2 products |
| F6 | **See-before-you-send pricing.** Campaign composer shows the Meta cost estimate before sending. Wallet balance is visible. Unused prepaid message credit is refundable on cancel | M | replica-build, replica-launch | hidden-cost 7, refund 12 |
| F7 | **Trial that proves it.** 14-day trial with the Meta test number and sandbox messages, no forced sales call, and a feature list generated from what's actually shipped (`features.csv`) | S | replica-launch | misled 12, "pre recorded demo call" |
| F8 | **AI template fixer** that checks a template against Meta's rules before submitting (thin, cheap once the AI agent exists) | S | replica-build | 1 review, 2 mentions |

Pricing and billing complaints (F1, F6) also go to `/replica-launch` for the pricing page.

## 5. The angle

Three options, each grounded in a top theme:

**A. Leave anytime**
For small businesses who got burned by WhatsApp tools that are easy to join and
impossible to leave, WhatsFlow cancels in one click, shows every rupee before you
send, and refunds unused credit.
Evidence: billing / cancel / refund, 24 + 15 + 12 reviews across 3 products.

**B. A human on WhatsApp**
For businesses who wait days for a support email while their WhatsApp is down,
WhatsFlow puts a real person one tap away, on WhatsApp.
Evidence: human support, 51 reviews across 3 products.

**C. Your number, protected**
For businesses whose WhatsApp number *is* their business, WhatsFlow warns you
before a broadcast can get you blocked, and shows the number's health every day.
Evidence: bans 7 reviews and setup pain 17 reviews, across 3 products plus HN. Thinner.

**Recommendation: A, with B as its proof.** "Honest WhatsApp CRM: real people,
one-click cancel." Billing is the cheapest set of complaints to fix in software
(F1, F2, F6 are mostly S) and the hardest for incumbents to copy without losing
revenue. Support (B) is the most-voiced complaint, but it's an ops promise as much
as a feature, so it backs A rather than leading. C works well as a feature
section, not as the headline.

Keep competitor names out of the WhatsFlow name, ads and store listing. A factual
comparison page is a question for a lawyer.
