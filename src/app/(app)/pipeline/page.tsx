import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatMoney } from "@/lib/plans";
import { PageHeader } from "@/components/ui";
import { Board } from "./board";

export const metadata: Metadata = { title: "Pipeline" };

export default async function Page() {
  const { db: d, org, role } = await requireOrg();
  const [stages, leads, members] = await Promise.all([
    d.select().from(schema.pipelineStages).where(eq(schema.pipelineStages.orgId, org.id)).orderBy(asc(schema.pipelineStages.position)),
    d
      .select({ lead: schema.leads, contactName: schema.contacts.name, waId: schema.contacts.waId })
      .from(schema.leads)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.leads.contactId))
      .where(eq(schema.leads.orgId, org.id)),
    d.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id)),
  ]);
  const open = leads.filter((l) => stages.find((s) => s.id === l.lead.stageId)?.kind === "open");
  return (
    <>
      <PageHeader title="Pipeline" description={`${open.length} open leads worth ${formatMoney(open.reduce((a, l) => a + l.lead.valueMinor, 0))}. Drag cards between stages.`} />
      <Board
        canEditStages={role !== "agent"}
        stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
        members={members}
        leads={leads.map((l) => ({
          id: l.lead.id,
          stageId: l.lead.stageId,
          title: l.lead.title,
          valueMinor: l.lead.valueMinor,
          currency: l.lead.currency,
          ownerId: l.lead.ownerId,
          notes: l.lead.notes,
          source: l.lead.source,
          conversationId: l.lead.conversationId,
          nextFollowUpAt: l.lead.nextFollowUpAt?.toISOString() ?? null,
          contact: l.contactName ?? l.waId,
        }))}
      />
    </>
  );
}
