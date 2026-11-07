import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Button, Card, PageHeader, StatusBadge, Textarea, cx } from "@/components/ui";
import { reply } from "../actions";

/** Support queue for WhatsFlow staff (users with is_staff). Customers never see this. */
export const metadata = { title: "Support queue" };

export default async function Page() {
  const s = await requireUser();
  if (!s.user.isStaff) notFound();
  const d = await db();
  const threads = await d
    .select({ t: schema.supportThreads, org: schema.orgs.name, user: schema.users.email })
    .from(schema.supportThreads)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.supportThreads.orgId))
    .innerJoin(schema.users, eq(schema.users.id, schema.supportThreads.userId))
    .orderBy(desc(schema.supportThreads.updatedAt))
    .limit(50);
  const all = await Promise.all(threads.map((x) => d.select().from(schema.supportMessages).where(eq(schema.supportMessages.threadId, x.t.id)).orderBy(asc(schema.supportMessages.createdAt))));
  return (
    <>
      <PageHeader title="Support queue" description="Open requests first." />
      <div className="max-w-4xl space-y-4 p-6">
        {threads
          .map((x, i) => ({ ...x, msgs: all[i] }))
          .sort((a, b) => (a.t.status === "open" ? 0 : 1) - (b.t.status === "open" ? 0 : 1))
          .map((x) => (
            <Card key={x.t.id} className="p-5">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 font-semibold">{x.t.subject}</h2>
                <StatusBadge status={x.t.status} />
              </div>
              <p className="text-xs text-muted">
                {x.org} · {x.user}
              </p>
              <div className="mt-3 space-y-2">
                {x.msgs.map((m) => (
                  <div key={m.id} className={cx("rounded-md px-3 py-2 text-sm", m.fromStaff ? "bg-surface-2" : "bg-bubble-out")}>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className="text-[10px] text-muted">{dateTime(m.createdAt)}</div>
                  </div>
                ))}
              </div>
              <form action={reply} className="mt-3 flex gap-2">
                <input type="hidden" name="threadId" value={x.t.id} />
                <Textarea name="body" aria-label="Staff reply" className="min-h-11 flex-1" required />
                <Button>Reply</Button>
              </form>
            </Card>
          ))}
      </div>
    </>
  );
}
