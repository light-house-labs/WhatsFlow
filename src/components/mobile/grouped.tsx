import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "@/components/ui";

/** Rendered only below 768px. Pair with <DesktopOnly> when a page has a phone-specific layout. */
export function MobileOnly({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("md:hidden", className)}>{children}</div>;
}
export function DesktopOnly({ children }: { children: ReactNode }) {
  return <div className="max-md:hidden">{children}</div>;
}

/** Phone screen body: bg-app ground that grouped sections sit on. */
export function MobileScreen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("min-h-full space-y-6 bg-app px-4 pt-4 pb-8", className)}>{children}</div>;
}

/** iOS-style grouped section: optional caption above, white rounded card, hairlines between rows. */
export function Group({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="mb-1.5 px-4 text-13 font-medium text-faint">{title}</h2>}
      <ul className="overflow-hidden rounded-xl bg-surface">{children}</ul>
      {footer && <p className="mt-1.5 px-4 text-13 text-faint">{footer}</p>}
    </section>
  );
}

type RowProps = {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Defaults to a chevron when the row links somewhere. */
  chevron?: boolean;
  danger?: boolean;
  className?: string;
};

function RowBody({ title, meta, leading, trailing, chevron, danger }: RowProps) {
  return (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="flex min-h-[inherit] min-w-0 flex-1 items-center gap-3 border-b border-line py-2.5 pr-4 group-last/row:border-0">
        <span className="min-w-0 flex-1">
          <span className={cx("row-title block truncate", danger && "text-danger")}>{title}</span>
          {meta && <span className="row-meta mt-0.5 block truncate">{meta}</span>}
        </span>
        {trailing && <span className="flex shrink-0 items-center gap-2 text-sm text-muted">{trailing}</span>}
        {chevron && <ChevronRight size={18} strokeWidth={2} aria-hidden className="-mr-1 shrink-0 text-placeholder" />}
      </span>
    </>
  );
}

const rowClass = "tap flex min-h-12 w-full items-center gap-3 pl-4 text-left active:bg-fill";

/** 48-56px row. A link gets a chevron; `meta` is the 13px second line. */
export function Row({ href, replace, ...p }: RowProps & { href?: string; replace?: boolean }) {
  return (
    <li className="group/row">
      {href ? (
        <Link href={href} replace={replace} className={cx(rowClass, p.meta && "min-h-14", p.className)}>
          <RowBody {...p} chevron={p.chevron ?? true} />
        </Link>
      ) : (
        <div className={cx(rowClass, "active:bg-transparent", p.meta && "min-h-14", p.className)}>
          <RowBody {...p} />
        </div>
      )}
    </li>
  );
}

/** A row that submits a form or runs a button action; put it inside the <form> or pass onClick from a client parent. */
export function ButtonRow({ name, value, ...p }: RowProps & { name?: string; value?: string }) {
  return (
    <li className="group/row">
      <button name={name} value={value} className={cx(rowClass, p.meta && "min-h-14", p.className)}>
        <RowBody {...p} />
      </button>
    </li>
  );
}

/** Rounded-square icon tile for the leading slot of settings-style rows. */
export function RowIcon({ children, tone = "bg-fill text-muted" }: { children: ReactNode; tone?: string }) {
  return <span className={cx("grid size-8 place-items-center rounded-lg [&>svg]:size-[18px]", tone)}>{children}</span>;
}

/** Horizontally scrolling filter chips for phone lists; the active one is solid ink. */
export function ChipBar({ children }: { children: ReactNode }) {
  return <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">{children}</nav>;
}
export function ChipLink({ href, on, children }: { href: string; on: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      replace
      data-nav="none"
      aria-current={on ? "true" : undefined}
      className={cx("tap inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-sm font-medium", on ? "bg-ink text-surface" : "bg-surface text-muted active:bg-fill")}
    >
      {children}
    </Link>
  );
}

/** Empty state inside a grouped section, so it reads as part of the list rather than a separate page. */
export function GroupEmpty({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-surface px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-fill text-muted [&>svg]:size-5">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Bottom action bar for full-screen forms: sticks above the home indicator (and the keyboard, on Android). */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] [&>*]:h-12 [&>*]:flex-1 [&>*]:text-base">
      {children}
    </div>
  );
}

/** For an existing desktop form's button row: on a phone it becomes a sticky bottom action bar with a full-width button. */
export const stickyBar =
  "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:mt-6 max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:pt-3 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:[&>button]:h-12 max-md:[&>button]:w-full max-md:[&>button]:text-base";

/** Group rows by a day bucket: Today, Yesterday, This week, then month names. */
export function dayBucket(d: Date, now = new Date()): string {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return d.toLocaleDateString("en-IN", { month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return [...m.entries()];
}
