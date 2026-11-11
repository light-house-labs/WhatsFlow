import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Workflow } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { createAutomation } from "./actions";
import { TRIGGER_LABEL } from "./labels";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "Automations" };

export default async function Page() {
  const { db: d, org, role } = await requireOrg();
  const rows = await d
    .select({
      a: schema.automations,
      runs: sql<number>`(select count(*) from automation_runs r where r.automation_id = ${schema.automations.id})`,
      failed: sql<number>`(select count(*) from automation_runs r where r.automation_id = ${schema.automations.id} and r.status = 'failed')`,
    })
    .from(schema.automations)
    .where(eq(schema.automations.orgId, org.id))
    .orderBy(desc(schema.automations.createdAt));
  return (
    <>
      <PageHeader
        title="Automations"
        description="When something happens, then do this: follow-ups, thank-yous, tags and assignments that run on their own."
        actions={
          role !== "agent" ? (
            <SaveForm action={createAutomation}>
              <SubmitButton>New automation</SubmitButton>
            </SaveForm>
          ) : undefined
        }
      />
      <div className="p-6">
        {rows.length === 0 ? (
<EmptyState
            icon={<Workflow />}
            columns={["Name", "When", "Steps", "Runs", "Status", "Edited"]}
            title="No automations yet"
            description="Run follow-ups, tags and assignments on their own when something happens."
            primary={{ label: "New automation", action: createAutomation, allow: role !== "agent" }}
            askAdmin="create an automation"
            hint="Example: when an order is paid, wait 3 days, then ask for a review."
          />
) : (
<Card>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>When</Th>
                  <Th>Steps</Th>
                  <Th>Runs</Th>
                  <Th>Status</Th>
                  <Th>Edited</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, runs, failed }) => (
                  <tr key={a.id} className="hover:bg-hover">
                    <Td>
                      <Link href={`/automations/${a.id}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                    </Td>
                    <Td className="text-muted">{TRIGGER_LABEL[a.trigger]}</Td>
                    <Td>{a.steps.length}</Td>
                    <Td>
                      {Number(runs)}
                      {Number(failed) > 0 && <span className="text-danger"> · {Number(failed)} failed</span>}
                    </Td>
                    <Td>
                      <StatusBadge status={a.status} />
                    </Td>
                    <Td className="text-muted">{timeAgo(a.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
)}
      </div>
    </>
  );
}
