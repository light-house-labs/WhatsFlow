import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { validateGraph } from "@/lib/flows/graph";
import { Builder } from "./builder";

export const metadata = { title: "Edit flow" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org } = await requireOrg("admin");
  const [f] = await d.select().from(schema.botFlows).where(and(eq(schema.botFlows.id, id), eq(schema.botFlows.orgId, org.id))).limit(1);
  if (!f) notFound();
  const services = await d.select({ id: schema.services.id, name: schema.services.name }).from(schema.services).where(and(eq(schema.services.orgId, org.id), eq(schema.services.active, true)));
  return <Builder services={services} id={f.id} initialName={f.name} initialStatus={f.status} initialTrigger={f.trigger} initialNodes={f.graph.nodes} initialEdges={f.graph.edges} initialProblems={validateGraph(f.graph)} />;
}
