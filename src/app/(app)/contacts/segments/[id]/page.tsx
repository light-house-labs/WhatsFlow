import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SegmentBuilder } from "../builder";
import { builderOptions } from "../data";

export const metadata: Metadata = { title: "Edit segment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org } = await requireOrg("admin");
  const [seg] = await d.select().from(schema.segments).where(and(eq(schema.segments.id, id), eq(schema.segments.orgId, org.id))).limit(1);
  if (!seg) notFound();
  const opts = await builderOptions(d, org.id);
  return (
    <>
      <PageHeader title={seg.name} description="Changes apply to campaigns that haven't started sending yet." />
      <SegmentBuilder initial={{ id: seg.id, name: seg.name, rules: seg.rules }} tags={opts.tags} fields={opts.fields} />
    </>
  );
}
