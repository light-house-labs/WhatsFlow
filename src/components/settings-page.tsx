import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { SettingsToc } from "@/components/settings";
import { HelpButton } from "@/components/help-drawer";

export type RailStatus = { label: string; value: string; tone?: "on" | "off" | "warn" };

const DOT = { on: "bg-accent", off: "bg-faint", warn: "bg-warning" } as const;

/**
 * Shared shell for every /settings page: a header (title + one-line live summary) above the cards, and a
 * right rail with "On this page", Status and Help. Below 1280px the rail becomes a compact strip above
 * the cards; below 1024px "On this page" is hidden.
 */
export function SettingsPage({
  title,
  summary,
  status,
  tips,
  children,
}: {
  title: string;
  summary: string;
  status: RailStatus[];
  tips: string[];
  children: ReactNode;
}) {
  const card = "rounded-xl border border-line bg-surface p-4";
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <aside className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:sticky xl:top-6 xl:order-2 xl:grid-cols-1 xl:self-start">
        <div className={cx(card, "hidden lg:block")}>
          <h2 className="section-label mb-2 text-faint">On this page</h2>
          <SettingsToc />
        </div>
        <div className={card}>
          <h2 className="section-label mb-2 text-faint">Status</h2>
          <dl className="space-y-2">
            {status.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-13 text-muted">{s.label}</dt>
                <dd className="flex min-w-0 items-center gap-1.5 text-right text-13 font-medium text-ink">
                  <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", DOT[s.tone ?? "off"])} />
                  <span className="min-w-0 break-words">{s.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={cx(card, "md:col-span-2 lg:col-span-1")}>
          <h2 className="section-label mb-2 text-faint">Help</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-13 text-muted">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <Link href="/support" className="link mt-3 inline-block text-13">
            Talk to a person
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 max-w-[760px] flex-col gap-4 xl:order-1">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="type-title text-ink">{title}</h2>
            <p className="mt-0.5 text-sm text-muted">{summary}</p>
          </div>
          <HelpButton className="shrink-0" />
        </header>
        {children}
      </div>
    </div>
  );
}
