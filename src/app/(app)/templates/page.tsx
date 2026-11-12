import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { ButtonLink, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { deleteTemplate, submitTemplate } from "./actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { DesktopOnly, Group, GroupEmpty, MobileOnly, MobileScreen } from "@/components/mobile/grouped";
import { TemplateRow } from "./mobile-templates";

export const metadata: Metadata = { title: "Templates" };

export default async function Page() {
  const { db: d, org, role } = await requireOrg();
  const rows = await d.select().from(schema.templates).where(eq(schema.templates.orgId, org.id)).orderBy(desc(schema.templates.createdAt));
  const pending = rows.some((r) => r.status === "pending");
  return (
    <>
      {pending && <AutoRefresh ms={4000} />}
      <MobileOnly>
        <MobileScreen>
          {rows.length === 0 ? (
            <GroupEmpty icon={<FileText />} title="No templates yet" description="Templates are written on a computer. Approval usually takes minutes." />
          ) : (
            <Group footer="WhatsApp requires an approved template to start a chat or reply after 24 hours.">
              {rows.map((t) => (
                <TemplateRow
                  key={t.id}
                  canEdit={role !== "agent"}
                  t={{ id: t.id, name: t.name, category: t.category, language: t.language, body: t.body, status: t.status, rejectionReason: t.rejectionReason, updated: timeAgo(t.updatedAt) }}
                />
              ))}
            </Group>
          )}
        </MobileScreen>
      </MobileOnly>
      <DesktopOnly>
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
        {rows.length === 0 ? (
<EmptyState
            icon={<FileText />}
            columns={["Name", "Category", "Message", "Status", "Updated", ""]}
            title="No templates yet"
            description="Create one for order updates, reminders or offers. Approval usually takes minutes."
            primary={{ label: "New template", href: "/templates/new", allow: role !== "agent" }}
            askAdmin="create a template"
          />
) : (
<Card>
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
                    <Td className="text-13">
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
                            <SaveForm action={submitTemplate} success="Submitted for approval">
                              <input type="hidden" name="id" value={t.id} />
                              <SubmitButton size="sm" variant="secondary" savingLabel="Submitting…" savedLabel="Submitted">
                                Submit for approval
                              </SubmitButton>
                            </SaveForm>
                          )}
                          <SaveForm action={deleteTemplate} success="Template deleted">
                            <input type="hidden" name="id" value={t.id} />
                            <SubmitButton size="sm" variant="ghost" aria-label={`Delete ${t.name}`} savingLabel="Deleting…" savedLabel="Deleted">
                              Delete
                            </SubmitButton>
                          </SaveForm>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
)}
      </div>
      </DesktopOnly>
    </>
  );
}
