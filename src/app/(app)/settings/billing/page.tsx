import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { schema } from "@/db";
import type { Plan } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { usageFor } from "@/lib/billing";
import { PLANS, formatMoney, limitsFor, overLimit } from "@/lib/plans";
import { dateTime } from "@/lib/format";
import { Alert, Button, ButtonLink, Card, Select, cx } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SettingsSection } from "@/components/settings";
import { cancel, choosePlan, resume } from "./actions";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "Plan & billing" };

const RANK: Record<Plan, number> = { trial: 0, starter: 1, team: 2, custom: 3 };

export default async function Page({ searchParams }: { searchParams: Promise<{ done?: string; preview?: Plan; interval?: "month" | "year" }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg("admin");
  const owner = role === "owner";
  const [usage, events] = await Promise.all([
    usageFor(d, org.id),
    d.select().from(schema.billingEvents).where(eq(schema.billingEvents.orgId, org.id)).orderBy(desc(schema.billingEvents.createdAt)).limit(20),
  ]);
  const interval = sp.interval === "year" ? "year" : (org.planInterval ?? "month");
  const limits = limitsFor(org.plan);
  const preview = sp.preview && (sp.preview === "starter" || sp.preview === "team") ? sp.preview : null;
  const isDowngrade = preview && org.billingStatus === "active" && RANK[preview] < RANK[org.plan];
  const willPause = preview ? overLimit(preview, usage) : [];
  const status =
    org.billingStatus === "trialing"
      ? `Free trial, ends ${dateTime(org.currentPeriodEnd)}`
      : org.billingStatus === "cancelled"
        ? "Cancelled. Choose a plan to switch automations and broadcasts back on."
        : org.cancelAtPeriodEnd
          ? `Cancelled. Access continues until ${dateTime(org.currentPeriodEnd)}, and you won't be charged again.`
          : `${PLANS[org.plan].name}, billed ${org.planInterval}ly. Renews ${dateTime(org.currentPeriodEnd)}.`;

  return (
    <SettingsPage title="Plan & billing" summary={status} status={[{ label: "Plan", value: PLANS[org.plan].name, tone: "on" }, { label: "Billing", value: org.billingStatus, tone: org.billingStatus === "active" || org.billingStatus === "trialing" ? "on" : "warn" }, { label: org.cancelAtPeriodEnd ? "Ends" : "Renews", value: dateTime(org.currentPeriodEnd), tone: org.cancelAtPeriodEnd ? "warn" : "off" }]} tips={["Downgrades apply at the end of the period.", "Going over a limit pauses automations and broadcasts.", "Only the owner can change the plan or cancel."]}>
      <div className="space-y-3 empty:hidden">
        {sp.done === "cancelled" && (
          <Alert tone="success">
            Your subscription is cancelled. Nothing more will be charged. We&apos;ve recorded it below. If you change your mind before it ends, click Resume.
          </Alert>
        )}
        {sp.done === "upgraded" && <Alert tone="success">Plan changed. New limits apply now.</Alert>}
        {sp.done === "downgrade_scheduled" && <Alert tone="success">Downgrade scheduled for {dateTime(org.currentPeriodEnd)}. Until then you keep your current plan.</Alert>}
        {sp.done === "resumed" && <Alert tone="success">Subscription resumed.</Alert>}
        {!owner && <Alert tone="accent">Only the workspace owner can change the plan or cancel.</Alert>}
      </div>

      <SettingsSection title="Usage" description={status}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Usage label="Team members" used={usage.seats} limit={limits.seats} />
          <Usage label="Live bot flows" used={usage.liveFlows} limit={limits.botFlows} />
          <Usage label="Connected numbers" used={usage.numbers} limit={limits.numbers} />
        </div>
      </SettingsSection>

      <SettingsSection title="Plan" description="Pick a plan or change how often you are billed.">
        {preview && owner ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">
              Switch to {PLANS[preview].name}, billed {interval}ly
            </h3>
            <p className="text-sm">
              {formatMoney(interval === "year" ? PLANS[preview].yearlyMinor : PLANS[preview].monthlyMinor)} / {interval} + GST.{" "}
              {isDowngrade ? `Takes effect on ${dateTime(org.currentPeriodEnd)}. Nothing changes before then.` : "Takes effect now."}
            </p>
            {willPause.length > 0 && (
              <Alert tone="warning">
                {isDowngrade ? "On that date we'll pause:" : "Over the new plan's limits:"}
                <ul className="ml-4 list-disc">
                  {willPause.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                {isDowngrade ? "The newest flows are paused first. Nothing is deleted, and we never charge you for the bigger plan instead." : null}
              </Alert>
            )}
            <div className="flex gap-2">
              <SaveForm action={choosePlan} success="Plan updated">
                <input type="hidden" name="plan" value={preview} />
                <input type="hidden" name="interval" value={interval} />
                <SubmitButton>Confirm change</SubmitButton>
              </SaveForm>
              <ButtonLink variant="secondary" href="/settings/billing">
                Back
              </ButtonLink>
            </div>
            <p className="text-xs text-muted">Payments: this build uses a manual billing provider in development, so no card is charged. Connect Razorpay or Stripe before going live.</p>
          </div>
        ) : (
          <>
            <form className="flex items-center gap-2 text-sm">
              <span>Billing period</span>
              <Select name="interval" defaultValue={interval} className="h-8 w-48 text-13" aria-label="Billing period">
                <option value="month">Monthly</option>
                <option value="year">Yearly (2 months free)</option>
              </Select>
              <Button size="sm" variant="secondary">
                Show prices
              </Button>
            </form>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["starter", "team"] as const).map((id) => {
                const p = PLANS[id];
                const current = org.plan === id && org.billingStatus === "active";
                return (
                  <Card key={id} className={cx("flex flex-col p-5", current && "bg-accent-soft")}>
                    <div className="flex items-center">
                      <h3 className="flex-1 type-heading">{p.name}</h3>
                      {current && <span className="section-label text-accent-text">Current plan</span>}
                    </div>
                    <p className="text-sm text-muted">{p.tagline}</p>
                    <div className="my-3 type-stat tabular-nums">
                      {formatMoney(interval === "year" ? p.yearlyMinor : p.monthlyMinor)}
                      <span className="text-sm font-normal text-muted"> / {interval}</span>
                    </div>
                    <ul className="flex-1 space-y-1 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <CheckCircle2 size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent-text" /> {f}
                        </li>
                      ))}
                    </ul>
                    {owner && !(current && org.planInterval === interval && !org.pendingPlan) && (
                      <ButtonLink className="mt-4" variant={current ? "secondary" : "primary"} href={`/settings/billing?preview=${id}&interval=${interval}`}>
                        {current ? `Switch to ${interval}ly` : org.billingStatus === "active" && RANK[id] < RANK[org.plan] ? `Downgrade to ${p.name}` : `Choose ${p.name}`}
                      </ButtonLink>
                    )}
                  </Card>
                );
              })}
            </div>
            <p className="text-sm text-muted">
              Need more numbers or seats? <Link href="/support" className="link">Talk to a person</Link>.
            </p>
          </>
        )}
      </SettingsSection>

        {owner && org.billingStatus !== "cancelled" && (
          <SettingsSection title="Cancel" description="One click, no call or email needed.">
            {org.cancelAtPeriodEnd ? (
              <SaveForm action={resume} success="Subscription resumed" className="mt-2 flex items-center gap-3">
                <p className="flex-1 text-sm text-muted">Already cancelled. Access ends {dateTime(org.currentPeriodEnd)}.</p>
                <SubmitButton variant="secondary">Resume subscription</SubmitButton>
              </SaveForm>
            ) : (
              <SaveForm action={cancel} success="Subscription cancelled" className="mt-2 flex flex-wrap items-center gap-3">
                <p className="w-full text-sm text-muted">
                  One click, no call or email needed. {org.billingStatus === "trialing" ? "Your trial ends now." : `You keep access until ${dateTime(org.currentPeriodEnd)} and won't be charged again.`} Your data stays exportable.
                </p>
                <Select name="reason" aria-label="Why are you cancelling? (optional)" className="w-64">
                  <option value="">Tell us why (optional)</option>
                  <option>Too expensive</option>
                  <option>Missing a feature</option>
                  <option>Switching to another tool</option>
                  <option>Not using it enough</option>
                  <option>Problems with WhatsApp or Meta</option>
                </Select>
                <SubmitButton variant="danger">Cancel subscription</SubmitButton>
              </SaveForm>
            )}
          </SettingsSection>
        )}

        <SettingsSection title="History" description="Plan changes on this workspace.">
          {events.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-40 shrink-0 text-muted">{dateTime(e.createdAt)}</span>
                <span>{e.kind.replace(".", " ").replaceAll("_", " ")}</span>
                {"to" in e.detail && <span className="text-muted">→ {String(e.detail.to)}</span>}
              </li>
            ))}
          </ul>
        </SettingsSection>
    </SettingsPage>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit >= 1000;
  const over = used > limit;
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("type-stat", over && "text-danger")}>
        {used} <span className="text-sm font-normal text-muted">/ {unlimited ? "unlimited" : limit}</span>
      </div>
      {!unlimited && (
        <div className="mt-1 h-1.5 rounded bg-surface-2">
          <div className={cx("h-1.5 rounded", over ? "bg-danger" : "bg-ink")} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
