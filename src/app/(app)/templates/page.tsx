import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { deleteTemplate, submitTemplate } from "./actions";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = { title: "Templates" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  const rows = await d.select().from(schema.templates).where(eq(schema.templates.orgId, org.id)).orderBy(desc(schema.templates.createdAt));
  const pending = rows.some((r) => r.status === "pending");
  return (
    <>
      {pending && <AutoRefresh ms={4000} />}
      <PageHeader
        title="Message templates"
        description="WhatsApp requires an approved template to start a conversation or reply after 24 hours."
        actions={
          role !== "agent" && (
            <ButtonLink href="/templates/new">
              <Plus size={16} /> New template
            </ButtonLink>
          )
        }
      />
      <div className="space-y-4 p-6">
        {sp.error === "used" && <Alert tone="danger">That template is used by a campaign, so it can&apos;t be deleted.</Alert>}
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={<FileText />} title="No templates yet" body="Create one for order updates, reminders or offers. Approval usually takes minutes." action={role !== "agent" && <ButtonLink href="/templates/new">New template</ButtonLink>} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th>Message</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <Td className="font-mono text-[13px]">
                      {t.name}
                      <div className="font-sans text-xs text-muted">{t.language}</div>
                    </Td>
                    <Td className="text-muted">{t.category.toLowerCase()}</Td>
                    <Td className="max-w-md">
                      <div className="line-clamp-2 text-sm">{t.body}</div>
                      {t.rejectionReason && <div className="mt-1 text-xs text-danger">Rejected: {t.rejectionReason}</div>}
                    </Td>
                    <Td>
                      <StatusBadge status={t.status} />
                    </Td>
                    <Td className="text-muted">{timeAgo(t.updatedAt)}</Td>
                    <Td>
                      {role !== "agent" && (
                        <div className="flex gap-1">
                          {(t.status === "draft" || t.status === "rejected") && (
                            <form action={submitTemplate}>
                              <input type="hidden" name="id" value={t.id} />
                              <Button size="sm" variant="secondary">
                                Submit for approval
                              </Button>
                            </form>
                          )}
                          <form action={deleteTemplate}>
                            <input type="hidden" name="id" value={t.id} />
                            <Button size="sm" variant="ghost" aria-label={`Delete ${t.name}`}>
                              Delete
                            </Button>
                          </form>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
