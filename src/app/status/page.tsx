import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { healthChecks, type CheckState } from "@/lib/health";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";

const LABEL: Record<CheckState, string> = { ok: "Working", degraded: "Slow or partly working", down: "Not working" };
const DOT: Record<CheckState, string> = { ok: "bg-success", degraded: "bg-warning", down: "bg-danger" };
const HEADLINE: Record<CheckState, string> = { ok: "Everything is working", degraded: "Some things are slow", down: "Something is broken and we're on it" };

export default async function StatusPage() {
  const h = await healthChecks(await db()).catch(() => null);
  const state: CheckState = h?.state ?? "down";
  const notice = process.env.STATUS_NOTICE?.trim();
  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 px-6 py-10">
      <Link href="/">
        <Logo />
      </Link>
      <div className="flex items-center gap-3">
        <span className={`size-3 rounded-full ${DOT[state]}`} aria-hidden="true" />
        <h1 className="text-2xl font-semibold">{HEADLINE[state]}</h1>
      </div>
      {notice && <Card className="border-warning/50 p-4 text-sm">{notice}</Card>}
      <Card>
        <ul className="divide-y divide-line">
          {(h?.checks ?? [{ id: "app", name: "App and inbox", state: "down" as const, detail: "We can't reach our database." }]).map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[c.state]}`} aria-hidden="true" />
              <div className="flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-muted">{c.detail}</div>
              </div>
              <span className="text-sm text-muted">{LABEL[c.state]}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm text-muted">
        WhatsApp itself is run by Meta. If messages aren&apos;t arriving and everything above is working, check{" "}
        <a className="text-accent" href="https://metastatus.com/whatsapp-business-api" target="_blank" rel="noreferrer noopener">
          Meta&apos;s status page
        </a>
        . Checked {h ? new Date(h.checkedAt).toUTCString() : "just now"}.
      </p>
    </div>
  );
}
