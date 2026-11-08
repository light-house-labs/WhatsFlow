import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { LANGUAGES } from "@/lib/routing";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { addRule, deleteRule, toggleRule } from "./actions";
import { MatchFields } from "./match-fields";

export const metadata: Metadata = { title: "Chat routing" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const [rules, members] = await Promise.all([
    d.select().from(schema.routingRules).where(eq(schema.routingRules.orgId, org.id)).orderBy(asc(schema.routingRules.position), asc(schema.routingRules.createdAt)),
    d
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, org.id))
      .orderBy(asc(schema.users.name)),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  return (
    <>
      <PageHeader title="Chat routing" description="Send each new chat to the right person, by what the customer wrote or the language they wrote in. The first matching rule wins." />
      <div className="max-w-4xl space-y-6 p-6">
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        <Card className="divide-y divide-line">
          {rules.length === 0 && <EmptyState title="No rules yet" body="Without rules, new chats wait unassigned until someone picks them up." />}
          {rules.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <span className="w-6 text-muted">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div>
                  {r.match === "keyword" ? "Message mentions " : "Written in "}
                  <strong>{r.match === "keyword" ? r.values.join(", ") : r.values.map((v) => LANGUAGES[v] ?? v).join(", ")}</strong>
                </div>
                <div className="text-muted">
                  {r.assignMode === "user" ? `Assign to ${nameOf.get(r.assigneeId ?? "") ?? "a former teammate"}` : r.assignMode === "least_busy" ? "Assign to the least busy teammate" : "Don't assign"}
                  {r.label && (
                    <>
                      {" · label "}
                      <Badge>{r.label}</Badge>
                    </>
                  )}
                  {" · "}
                  {r.hits === 1 ? "1 chat routed" : `${r.hits} chats routed`}
                </div>
              </div>
              <form action={toggleRule}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                <Button size="sm" variant="secondary">
                  {r.active ? "Turn off" : "Turn on"}
                </Button>
              </form>
              <form action={deleteRule}>
                <input type="hidden" name="id" value={r.id} />
                <Button size="sm" variant="ghost" className="text-danger">
                  Delete
                </Button>
              </form>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Add a rule</h2>
          <form action={addRule} className="space-y-4">
            <MatchFields languages={LANGUAGES} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign to" htmlFor="assignTo">
                <Select id="assignTo" name="assignTo" defaultValue="least_busy">
                  <option value="least_busy">Least busy teammate</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="">Nobody, just label it</option>
                </Select>
              </Field>
              <Field label="Label (optional)" htmlFor="label" hint="Shown on the chat in the inbox, e.g. billing or hindi.">
                <Input id="label" name="label" maxLength={30} />
              </Field>
            </div>
            <Button>Add rule</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
