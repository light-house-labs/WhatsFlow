import type { Metadata } from "next";
import { and, desc, eq, lt } from "drizzle-orm";
import Link from "next/link";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { AUDIT_LABELS } from "@/lib/audit";
import { dateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;

export default async function Page({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;
  const rows = await d
    .select({ e: schema.auditLog, name: schema.users.name })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
    .where(and(eq(schema.auditLog.orgId, org.id), before ? lt(schema.auditLog.createdAt, before) : undefined))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(PAGE + 1);
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  return (
    <>
      <PageHeader title="Audit log" description="Changes to team, numbers, integrations, keys and billing in this workspace, newest first." />
      <div className="max-w-4xl p-6">
        <Card>
          {shown.length === 0 ? (
            <EmptyState title="Nothing yet" body="Changes to settings show up here." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Who</th>
                  <th className="px-4 py-2 font-medium">What</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map(({ e, name }) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{dateTime(e.createdAt, org.timezone)}</td>
                    <td className="px-4 py-2">{name ?? "Former teammate"}</td>
                    <td className="px-4 py-2">
                      {AUDIT_LABELS[e.action] ?? e.action}
                      {e.target && <span className="text-muted"> · {e.target}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {more && (
          <Link className="mt-4 inline-block text-sm text-accent" href={`/settings/audit?before=${encodeURIComponent(shown[shown.length - 1].e.createdAt.toISOString())}`}>
            Older entries
          </Link>
        )}
      </div>
    </>
  );
}
