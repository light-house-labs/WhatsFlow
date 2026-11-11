import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowDown, Bot, Plus } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { limitsFor } from "@/lib/plans";
import { timeAgo } from "@/lib/format";
import { Button, ButtonLink, Card, EmptyState, PageHeader, SectionLabel, StatusBadge, Table, Td, Th } from "@/components/ui";
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
                <Plus size={15} strokeWidth={1.75} /> New flow
              </Button>
            </form>
          )
        }
      />
      {role !== "agent" && (
        <details id="starters" className="group border-b border-line" open={flows.length <= 1}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-3.5 transition-colors duration-150 hover:bg-hover [&::-webkit-details-marker]:hidden">
            <SectionLabel as="div">Start from a template</SectionLabel>
            <ArrowDown size={13} strokeWidth={1.75} aria-hidden className="text-accent-text transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="grid border-t border-line md:grid-cols-2 xl:grid-cols-4">
            {Object.values(STARTERS).map((s) => (
              <form
                key={s.key}
                action={createFromStarter}
                className="flex flex-col border-line px-6 py-5 max-md:border-b md:border-r md:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0 md:max-xl:[&:nth-child(-n+2)]:border-b"
              >
                <input type="hidden" name="starter" value={s.key} />
                <div className="type-heading">{s.name}</div>
                <p className="mt-1.5 flex-1 text-13 leading-relaxed text-muted">{s.description}</p>
                <Button size="sm" variant="secondary" className="mt-4 self-start">
                  Use this
                </Button>
              </form>
            ))}
          </div>
        </details>
      )}
      {flows.length === 0 ? (
        <div className="p-6">
        <EmptyState
          icon={<Bot />}
          columns={["Flow", "Starts on", "Blocks", "Runs", "Edited", "Status", ""]}
          title="No flows yet"
          description="Start with a menu that answers prices, books visits and hands over the rest."
          primary={{ label: "Create flow", action: createFlow, allow: role !== "agent" }}
          secondary={{ label: "Start from a template", href: "#starters", allow: role !== "agent" }}
          askAdmin="create a flow"
        />
        </div>
      ) : (
        <div className="p-6">
          <Card><Table>
            <thead>
              <tr>
                <Th>Flow</Th>
                <Th>Starts on</Th>
                <Th className="text-right">Blocks</Th>
                <Th className="text-right">Runs</Th>
                <Th>Edited</Th>
                <Th>Status</Th>
                {role !== "agent" && <Th><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.id} className="group transition-colors duration-150 hover:bg-hover">
                  <Td>
                    <Link href={`/bots/${f.id}`} className="font-semibold decoration-1 underline-offset-4 group-hover:underline">
                      {f.name}
                    </Link>
                  </Td>
                  <Td className="max-w-[34ch] text-13 text-muted">
                    {f.trigger.kind === "keyword" ? (f.trigger.keywords.length ? `Starts when someone says: ${f.trigger.keywords.join(", ")}` : "No trigger keywords yet") : "Starts on every new conversation"}
                  </Td>
                  <Td className="text-right text-13">{f.graph.nodes.length - 1}</Td>
                  <Td className="text-right text-13">{f.runs}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{timeAgo(f.updatedAt)}</Td>
                  <Td>
                    <StatusBadge status={f.status} />
                  </Td>
                  {role !== "agent" && (
                    <Td>
                      <div className="flex items-center justify-end gap-3">
                        <ButtonLink href={`/bots/${f.id}`} variant="ghost" size="sm">
                          Edit
                        </ButtonLink>
                        <form action={toggleFlow}>
                          <input type="hidden" name="id" value={f.id} />
                          <Button size="sm" variant={f.status === "live" ? "secondary" : "primary"}>
                            {f.status === "live" ? "Pause" : "Set live"}
                          </Button>
                        </form>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table></Card>
        </div>
      )}
    </>
  );
}
