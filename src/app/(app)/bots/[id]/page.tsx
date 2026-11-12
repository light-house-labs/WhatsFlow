import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { validateGraph } from "@/lib/flows/graph";
import { Alert, StatusBadge } from "@/components/ui";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { Group, MobileScreen, Row, StickyActions } from "@/components/mobile/grouped";
import { BestOnDesktop, ViewportSwitch } from "@/components/mobile/desktop-only";
import { toggleFlow } from "../actions";
import { Builder } from "./builder";

export const metadata = { title: "Edit flow" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ problems?: string }> }) {
  const { id } = await params;
  const { problems } = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const [f] = await d.select().from(schema.botFlows).where(and(eq(schema.botFlows.id, id), eq(schema.botFlows.orgId, org.id))).limit(1);
  if (!f) notFound();
  const services = await d.select({ id: schema.services.id, name: schema.services.name }).from(schema.services).where(and(eq(schema.services.orgId, org.id), eq(schema.services.active, true)));
  const issues = validateGraph(f.graph);
  // Phone: view, stats and the live/draft switch only; the canvas needs a computer.
  const summary = (
    <MobileScreen className="pb-0">
      {problems && issues.length > 0 && <Alert tone="danger">This flow has {issues.length} problem{issues.length === 1 ? "" : "s"} to fix before it can go live.</Alert>}
      <Group title={f.name}>
        <Row title="Status" trailing={<StatusBadge status={f.status} />} />
        <Row title="Starts" meta={f.trigger.kind === "keyword" ? (f.trigger.keywords.join(", ") || "No trigger keywords yet") : "On every new conversation"} />
        <Row title="Runs" trailing={<span className="text-[15px] font-medium text-ink tabular-nums">{f.runs}</span>} />
        <Row title="Blocks" trailing={<span className="text-[15px] font-medium text-ink tabular-nums">{f.graph.nodes.length - 1}</span>} />
        <Row title="Edited" trailing={timeAgo(f.updatedAt)} />
      </Group>
      <BestOnDesktop what="The flow builder" />
      <SaveForm action={toggleFlow} success={f.status === "live" ? "Flow paused" : "Flow is live"}>
        <input type="hidden" name="id" value={f.id} />
        <StickyActions>
          <SubmitButton variant={f.status === "live" ? "secondary" : "primary"} savingLabel={f.status === "live" ? "Pausing…" : "Going live…"}>
            {f.status === "live" ? "Pause flow" : "Set live"}
          </SubmitButton>
        </StickyActions>
      </SaveForm>
    </MobileScreen>
  );
  return (
    <ViewportSwitch
      mobile={summary}
      desktop={<Builder services={services} id={f.id} initialName={f.name} initialStatus={f.status} initialTrigger={f.trigger} initialNodes={f.graph.nodes} initialEdges={f.graph.edges} initialProblems={issues} />}
    />
  );
}
