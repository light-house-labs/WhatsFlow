import { Route } from "lucide-react";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { LANGUAGES } from "@/lib/routing";
import { Alert, Badge, Button, EmptyState, Field, Input, Select } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SettingsSection } from "@/components/settings";
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
  const activeRules = rules.filter((r) => r.active).length;
  const routed = rules.reduce((n, r) => n + r.hits, 0);
  return (
    <SettingsPage title="Chat routing" summary={rules.length ? `${activeRules} of ${rules.length} ${rules.length === 1 ? "rule" : "rules"} on · first match wins` : "No rules · new chats wait unassigned"} status={[{ label: "Rules on", value: `${activeRules} of ${rules.length}`, tone: activeRules ? "on" : "off" }, { label: "Chats routed", value: String(routed), tone: routed ? "on" : "off" }, { label: "No match", value: "Stays unassigned", tone: "off" }]} tips={["Rules run top to bottom; the first match wins.", "Least busy spreads chats evenly across the team.", "A label alone is fine: choose Nobody, just label it."]}>
      {sp.error && (
        <Alert tone="danger">{sp.error}</Alert>
      )}
      <SettingsSection title="Rules" description="Send each new chat to the right person, by what the customer wrote or the language they wrote in. Checked top to bottom: the first matching rule wins." flush>
        {rules.length === 0 && <EmptyState inside icon={<Route />} columns={["Rule", "Assigns to"]} title="No rules yet" description="Without rules, new chats wait unassigned until someone picks them up." />}
        {rules.length > 0 && (
        <div className="divide-y divide-line">
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
        </div>
        )}
      </SettingsSection>
      <SettingsSection title="Add a rule" description="Match on a word in the first message, or on the language it is written in.">
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
      </SettingsSection>
    </SettingsPage>
  );
}
