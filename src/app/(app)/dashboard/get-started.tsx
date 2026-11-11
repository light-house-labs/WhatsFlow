"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";

export type GetStartedStep = { label: string; hint: string; href: string; done: boolean };

/**
 * Setup checklist. Every item ticks itself from real data; hidden once all are done or it's dismissed.
 * Dismissing sets `cookie`, which the page reads so the card doesn't flash back in.
 */
export function GetStarted({ cookie, steps }: { cookie: string; steps: GetStartedStep[] }) {
  const [hidden, setHidden] = useState(false);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;

  const dismiss = () => {
    document.cookie = `${cookie}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setHidden(true);
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="type-heading">Get started</h2>
          <p className="mt-0.5 text-13 text-muted">
            <span className="tabular-nums">
              {done} of {steps.length}
            </span>{" "}
            done. Each step ticks itself off when it&apos;s set up.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-muted hover:text-ink" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-fill"
        role="progressbar"
        aria-label="Get started progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="-mx-2 mt-3">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="group flex items-center gap-3 rounded-md px-2 py-2 transition-surface hover:bg-fill">
              <span
                className={cx(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  s.done ? "bg-accent text-on-accent" : "border border-line-strong",
                )}
              >
                {s.done && <Check size={12} strokeWidth={2.5} aria-hidden />}
                <span className="sr-only">{s.done ? "Done:" : "To do:"}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-sm font-medium", s.done ? "text-muted line-through decoration-faint" : "text-ink")}>{s.label}</span>
                {!s.done && <span className="block text-13 text-faint">{s.hint}</span>}
              </span>
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
