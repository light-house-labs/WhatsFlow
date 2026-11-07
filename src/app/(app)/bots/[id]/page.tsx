import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { validateGraph } from "@/lib/flows/graph";
import { Builder } from "./builder";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org } = await requireOrg("admin");
  const [f] = await d.select().from(schema.botFlows).where(and(eq(schema.botFlows.id, id), eq(schema.botFlows.orgId, org.id))).limit(1);
  if (!f) notFound();
  return <Builder id={f.id} initialName={f.name} initialStatus={f.status} initialTrigger={f.trigger} initialNodes={f.graph.nodes} initialEdges={f.graph.edges} initialProblems={validateGraph(f.graph)} />;
}
