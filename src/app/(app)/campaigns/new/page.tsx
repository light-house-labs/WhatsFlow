import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "New campaign" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tag?: string; segment?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const [templates, numbers, tagRows, fieldRows, segments] = await Promise.all([
    d.select().from(schema.templates).where(and(eq(schema.templates.orgId, org.id), eq(schema.templates.status, "approved"))),
    d.select().from(schema.waNumbers).where(and(eq(schema.waNumbers.orgId, org.id), eq(schema.waNumbers.status, "connected"))),
    d.execute(sql`select t as tag, count(*)::int as n from contacts, unnest(tags) t where org_id = ${org.id} group by t order by n desc`),
    d.execute(sql`select distinct jsonb_object_keys(custom_fields) as k from contacts where org_id = ${org.id} limit 50`),
    d.select({ id: schema.segments.id, name: schema.segments.name }).from(schema.segments).where(eq(schema.segments.orgId, org.id)).orderBy(schema.segments.name),
  ]);
  const rows = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));
  if (!templates.length)
    return (
      <>
        <PageHeader title="New campaign" />
        <div className="p-6">
        <EmptyState
          icon={<FileText />}
          title="You need an approved template first"
          description="WhatsApp only allows approved templates in broadcasts."
          primary={{ label: "Create a template", href: "/templates/new" }}
        />
        </div>
      </>
    );
  return (
    <>
      <PageHeader title="New campaign" description="You'll see who it reaches and roughly what Meta will charge before anything is sent." />
      <Composer
        templates={templates.map((t) => ({ id: t.id, name: t.name, body: t.body, category: t.category, headerText: t.headerText, headerType: t.headerType, footer: t.footer }))}
        numbers={numbers.map((n) => ({ id: n.id, label: `${n.displayPhone} · ${n.displayName}${n.provider === "sandbox" ? " (sandbox)" : ""}`, quality: n.qualityRating, tier: n.messagingTier }))}
        tags={rows<{ tag: string; n: number }>(tagRows)}
        fields={rows<{ k: string }>(fieldRows).map((f) => f.k)}
        initialTags={sp.tag ? [sp.tag] : []}
        segments={segments}
        initialSegment={segments.some((x) => x.id === sp.segment) ? sp.segment : undefined}
      />
    </>
  );
}
