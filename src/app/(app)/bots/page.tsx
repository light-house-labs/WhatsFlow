import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { limitsFor } from "@/lib/plans";
import { timeAgo } from "@/lib/format";
import { Button, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { STARTERS } from "@/lib/starter-flows";
import { createFlow, createFromStarter, toggleFlow } from "./actions";

export const metadata: Metadata = { title: "Bot flows" };

export default async function Page() {
  const { db: d, org, role } = await requireOrg();
  const flows = await d.select().from(schema.botFlows).where(eq(schema.botFlows.orgId, org.id)).orderBy(desc(schema.botFlows.updatedAt));
  const live = flows.filter((f) => f.status === "live").length;
  const limit = limitsFor(org.plan).botFlows;
  return (
    <>
      <PageHeader
        title="Bot flows"
        description={`Automatic conversations that answer, ask, tag and hand over to your team. ${live} of ${limit >= 1000 ? "unlimited" : limit} live.`}
        actions={
          role !== "agent" && (
            <form action={createFlow}>
              <Button>
                <Plus size={16} /> New flow
              </Button>
            </form>
          )
        }
      />
      {role !== "agent" && (
        <details className="mx-6 mt-6 rounded-lg border border-line bg-surface" open={flows.length <= 1}>
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Start from a template</summary>
          <div className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
            {Object.values(STARTERS).map((s) => (
              <form key={s.key} action={createFromStarter} className="flex flex-col rounded-md border border-line p-3">
                <input type="hidden" name="starter" value={s.key} />
                <div className="text-sm font-medium">{s.name}</div>
                <p className="mt-1 flex-1 text-xs text-muted">{s.description}</p>
                <Button size="sm" variant="secondary" className="mt-3 self-start">
                  Use this
                </Button>
              </form>
            ))}
          </div>
        </details>
      )}
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {flows.length === 0 && (
          <Card className="md:col-span-3">
            <EmptyState icon={<Bot />} title="No flows" body="Start with a menu that answers prices, books visits and hands over the rest." />
          </Card>
        )}
        {flows.map((f) => (
          <Card key={f.id} className="flex flex-col p-5">
            <div className="flex items-start gap-2">
              <Link href={`/bots/${f.id}`} className="flex-1 font-semibold hover:text-accent">
                {f.name}
              </Link>
              <StatusBadge status={f.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {f.trigger.kind === "keyword" ? (f.trigger.keywords.length ? `Starts when someone says: ${f.trigger.keywords.join(", ")}` : "No trigger keywords yet") : "Starts on every new conversation"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {f.graph.nodes.length - 1} blocks · {f.runs} runs · edited {timeAgo(f.updatedAt)}
            </p>
            {role !== "agent" && (
              <div className="mt-4 flex gap-2">
                <Link href={`/bots/${f.id}`} className="text-sm text-accent">
                  Edit
                </Link>
                <form action={toggleFlow} className="ml-auto">
                  <input type="hidden" name="id" value={f.id} />
                  <Button size="sm" variant={f.status === "live" ? "secondary" : "primary"}>
                    {f.status === "live" ? "Pause" : "Set live"}
                  </Button>
                </form>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
