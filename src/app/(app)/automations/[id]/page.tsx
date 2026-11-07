import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { dateTime } from "@/lib/format";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import { deleteAutomation } from "../actions";
import { Editor } from "./editor";

export const metadata: Metadata = { title: "Automation" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org } = await requireOrg("admin");
  const [a] = await d.select().from(schema.automations).where(and(eq(schema.automations.id, id), eq(schema.automations.orgId, org.id)));
  if (!a) notFound();
  const [templates, team, runs] = await Promise.all([
    d.select({ id: schema.templates.id, name: schema.templates.name }).from(schema.templates).where(and(eq(schema.templates.orgId, org.id), eq(schema.templates.status, "approved"))),
    d.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id)),
    d
      .select({ r: schema.automationRuns, name: schema.contacts.name, waId: schema.contacts.waId })
      .from(schema.automationRuns)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.automationRuns.contactId))
      .where(eq(schema.automationRuns.automationId, a.id))
      .orderBy(desc(schema.automationRuns.createdAt))
      .limit(50),
  ]);
  return (
    <>
      <PageHeader title={a.name} description="Steps run in order. A failed step stops the run and shows here." />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <Editor
          id={a.id}
          initial={{ name: a.name, trigger: a.trigger, minutes: Number(a.triggerConfig.minutes ?? 120), steps: a.steps, live: a.status === "live" }}
          templates={templates}
          team={team}
        />
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Activity</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-muted">No runs yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {runs.map(({ r, name, waId }) => (
                  <li key={r.id} className="border-b border-line pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{name ?? formatWaId(waId)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-muted">{dateTime(r.createdAt, org.timezone)}</div>
                    {r.log.slice(-3).map((l, i) => (
                      <div key={i} className={`text-xs ${l.ok ? "text-muted" : "text-danger"}`}>
                        Step {l.step + 1}: {l.detail}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <form action={deleteAutomation}>
            <input type="hidden" name="id" value={a.id} />
            <Button variant="ghost" size="sm" className="text-danger">
              Delete automation
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
