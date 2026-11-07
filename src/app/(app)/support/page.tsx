import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { dateTime, timeAgo } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { Alert, Button, ButtonLink, Card, Field, Input, PageHeader, StatusBadge, Textarea, cx } from "@/components/ui";
import { openThread, reply } from "./actions";

export const metadata: Metadata = { title: "Talk to a person" };

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, user } = await requireOrg();
  const threads = await d.select().from(schema.supportThreads).where(eq(schema.supportThreads.orgId, org.id)).orderBy(desc(schema.supportThreads.updatedAt));
  const current = threads.find((t) => t.id === sp.t);
  const messages = current ? await d.select().from(schema.supportMessages).where(eq(schema.supportMessages.threadId, current.id)).orderBy(asc(schema.supportMessages.createdAt)) : [];
  const wa = process.env.SUPPORT_WHATSAPP;
  return (
    <>
      {current && <AutoRefresh ms={5000} />}
      <PageHeader
        title="Talk to a person"
        description="A real person on our team reads every message. We aim to reply within 2 working hours, Monday to Saturday."
        actions={
          <>
            {wa && (
              <ButtonLink href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I need help with WhatsFlow (workspace: ${org.name})`)}`} target="_blank">
                <MessageCircle size={16} /> Message us on WhatsApp
              </ButtonLink>
            )}
            {user.isStaff && (
              <ButtonLink variant="secondary" href="/support/staff">
                Staff view
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid max-w-5xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <Link href="/support" className={cx("block rounded-md px-3 py-2 text-sm", !current ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}>
            + New request
          </Link>
          {threads.map((t) => (
            <Link key={t.id} href={`/support?t=${t.id}`} className={cx("block rounded-md px-3 py-2 text-sm", current?.id === t.id ? "bg-accent-soft" : "hover:bg-surface-2")}>
              <div className="truncate font-medium">{t.subject}</div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <StatusBadge status={t.status} /> {timeAgo(t.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
        {current ? (
          <Card className="flex flex-col p-5">
            <h2 className="mb-3 font-semibold">{current.subject}</h2>
            <div className="flex-1 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={cx("max-w-[80%] rounded-lg px-3 py-2 text-sm", m.fromStaff ? "bg-surface-2" : "ml-auto bg-bubble-out")}>
                  <div className="mb-0.5 text-[11px] font-medium text-accent">{m.fromStaff ? "WhatsFlow team" : "You"}</div>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className="mt-0.5 text-right text-[10px] text-muted">{dateTime(m.createdAt)}</div>
                </div>
              ))}
              {current.status === "open" && <p className="text-center text-xs text-muted">Waiting for our team. You&apos;ll see the reply here.</p>}
            </div>
            <form action={reply} className="mt-4 flex gap-2">
              <input type="hidden" name="threadId" value={current.id} />
              <Textarea name="body" aria-label="Reply" className="min-h-11 flex-1" required />
              <Button>Send</Button>
            </form>
          </Card>
        ) : (
          <Card className="p-5">
            {sp.error && <Alert tone="danger">Write your question first.</Alert>}
            <form action={openThread} className="space-y-4">
              <Field label="Subject" htmlFor="subject">
                <Input id="subject" name="subject" placeholder="e.g. My number won't connect" />
              </Field>
              <Field label="What's happening?" htmlFor="body" hint="Screenshots help: paste a link. For billing, include what you expected to be charged.">
                <Textarea id="body" name="body" rows={6} required />
              </Field>
              <Button>Send to our team</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
