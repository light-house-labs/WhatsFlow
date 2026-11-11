import Link from "next/link";
import { clsx } from "clsx";
import { AlertCircle, ArrowDown, ArrowRight, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { HelpButton } from "@/components/help-drawer";

export const cx = clsx;

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-accent text-on-accent not-disabled:hover:bg-accent-hover disabled:bg-fill disabled:text-faint",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-fill disabled:border-line disabled:bg-fill disabled:text-faint",
  ghost: "text-ink px-2! hover:bg-fill disabled:text-faint disabled:hover:bg-transparent",
  danger: "bg-danger-soft text-danger hover:bg-danger-hover disabled:bg-fill disabled:text-faint",
};
const btnSize = { sm: "h-8 px-3 text-13", md: "h-9 px-4 text-sm" };
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-[-0.005em] transition-surface disabled:cursor-not-allowed active:translate-y-px";

type Arrow = "right" | "down";
function ArrowGlyph({ dir }: { dir: Arrow }) {
  const Icon = dir === "down" ? ArrowDown : ArrowRight;
  return <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />;
}

/** Ghost buttons read as text; pass `arrow` to add the ↓/→ cue. */
export function Button({
  variant = "primary",
  size = "md",
  arrow,
  className,
  children,
  ...p
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md"; arrow?: Arrow }) {
  return (
    <button className={cx(btnBase, btnSize[size], btn[variant], className)} {...p}>
      {children}
      {arrow && <ArrowGlyph dir={arrow} />}
    </button>
  );
}

/** Ghost links get a → by default, since they navigate. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  arrow,
  className,
  children,
  ...p
}: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: "sm" | "md"; arrow?: Arrow | false }) {
  const a = arrow ?? (variant === "ghost" ? "right" : undefined);
  return (
    <Link className={cx(btnBase, btnSize[size], btn[variant], className)} {...p}>
      {children}
      {a && <ArrowGlyph dir={a} />}
    </Link>
  );
}

const field =
  "w-full rounded-md border border-line-strong bg-field px-3 text-sm text-ink placeholder:text-placeholder transition-surface disabled:bg-fill disabled:text-faint";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(field, "h-9", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(field, "py-2 min-h-20 leading-relaxed", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(field, "h-9 pr-8", className)} {...p} />;
}

/** Field label: sans 12/16/600. */
export function Label({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cx("section-label block text-faint", className)}>
      {children}
    </label>
  );
}

/** Section label: sans 12/16/600, text-3, sentence case. */
export function SectionLabel({ children, className, as: Tag = "h2" }: { children: ReactNode; className?: string; as?: "h2" | "h3" | "div" }) {
  return <Tag className={cx("section-label text-faint", className)}>{children}</Tag>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div data-search-field className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-lg border border-line bg-surface", className)} {...p} />;
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-fill text-muted",
  accent: "bg-fill text-ink",
  success: "bg-accent-soft text-accent-text",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
/** Status chip: sans, subtle fill, no border. Green only for live/success. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  live: "success",
  approved: "success",
  connected: "success",
  sent: "success",
  resolved: "success",
  won: "success",
  answered: "success",
  answered_by_bot: "accent",
  converted: "accent",
  draft: "neutral",
  closed: "neutral",
  pending: "warning",
  scheduled: "warning",
  sending: "warning",
  open: "accent",
  needs_human: "warning",
  rejected: "danger",
  failed: "danger",
  cancelled: "neutral",
  urgent: "danger",
  high: "warning",
  paid: "success",
  confirmed: "accent",
  shipped: "accent",
  delivered: "success",
  unpaid: "neutral",
  link_sent: "warning",
  refunded: "neutral",
  booked: "accent",
  completed: "success",
  no_show: "danger",
  ok: "success",
  waiting: "warning",
  running: "warning",
  done: "success",
  stopped: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ")}</Badge>;
}

/** Segmented control: fill track holding pills; scrolls sideways instead of wrapping. */
export const segmentedTrack = "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-fill p-0.5 [scrollbar-width:none]";

/** Segment classes for links and buttons inside `segmentedTrack`: white segment with a border when active. */
export const filterChip = (on: boolean) =>
  cx(
    "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-3 text-13 font-medium transition-surface",
    on ? "border-line bg-surface text-ink" : "border-transparent text-soft hover:text-ink",
  );

export const underlineTab = filterChip;

/** Filter tab: sans; the selected one has the green underline. */
export function FilterLink({ on, className, ...p }: ComponentProps<typeof Link> & { on: boolean }) {
  return <Link aria-current={on ? "true" : undefined} className={cx(filterChip(on), className)} {...p} />;
}

/** Nav row shared by the app sidebar and the settings subnav: 34px tall, 8px padding, 16px icon + 10px gap. Active is a surface card on the tinted sidebar. */
export const navItem = (on: boolean) =>
  cx(
    "flex h-[34px] items-center gap-2.5 rounded-md border px-2 text-13 transition-surface",
    on ? "border-line bg-surface text-ink shadow-xs" : "border-transparent text-muted hover:bg-hover hover:text-ink",
  );
export const navIcon = (on: boolean) => cx("shrink-0", on ? "text-accent" : "text-faint");

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line bg-surface px-6 pb-4 pt-6">
      <div className="min-w-0">
        <h1 className="type-title text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-[68ch] text-sm text-muted">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <HelpButton />
      </div>
    </div>
  );
}

export type EmptyAction = {
  label?: string;
  href?: string;
  onClick?: () => void;
  /** A server action, for buttons that submit a form. */
  action?: (formData: FormData) => void | Promise<void>;
  /** Set false to hide the action for roles that can't perform it. */
  allow?: boolean;
};

const EMPTY_DEFAULTS = {
  filtered: { title: "No matches", description: "Try a different search or filter", label: "Clear filters" },
  error: { title: "", description: "Something went wrong. Try again in a moment.", label: "Retry" },
  "first-use": { title: "", description: "", label: "" },
} as const;

function EmptyButton({ a, variant, defaultLabel }: { a: EmptyAction; variant: BtnVariant; defaultLabel: string }) {
  const label = a.label ?? defaultLabel;
  if (a.action) {
    return (
      <form action={a.action}>
        <Button variant={variant}>{label}</Button>
      </form>
    );
  }
  if (a.href) return <ButtonLink href={a.href} variant={variant}>{label}</ButtonLink>;
  return (
    <Button type="button" variant={variant} onClick={a.onClick}>
      {label}
    </Button>
  );
}

/**
 * One empty state for every list, board and settings section.
 * Actions with `allow: false` are dropped; if none remain, `askAdmin` ("invite teammates") renders as plain text.
 */
export function EmptyState({
  icon,
  title,
  description,
  primary,
  secondary,
  hint,
  variant = "first-use",
  thing,
  askAdmin,
  inside,
  columns,
}: {
  /** Always pass one; filtered and error fall back to a search / alert icon. */
  icon?: ReactNode;
  title?: string;
  description?: string;
  primary?: EmptyAction;
  secondary?: EmptyAction;
  hint?: ReactNode;
  variant?: "first-use" | "filtered" | "error";
  /** For the error variant: "Couldn't load {thing}". */
  thing?: string;
  askAdmin?: string;
  /** Already inside a container (a card, a column, a pane): render without our own border. */
  inside?: boolean;
  /** Table headings. Renders a table card whose header row stays visible and the empty state fills the body (min 280px). */
  columns?: string[];
}) {
  const d = EMPTY_DEFAULTS[variant];
  const Icon = variant === "error" ? AlertCircle : Search;
  const heading = title ?? (variant === "error" ? `Couldn't load ${thing ?? "this"}` : d.title);
  const actions: { a: EmptyAction; v: BtnVariant }[] = [];
  if (primary && primary.allow !== false) actions.push({ a: primary, v: "primary" });
  if (secondary && secondary.allow !== false) actions.push({ a: secondary, v: "secondary" });
  const adminOnly = actions.length === 0 && askAdmin;
  const body = (
    <div className={cx("flex flex-col items-center justify-center px-6 py-12 text-center", columns ? "min-h-[280px]" : inside ? "h-full" : "min-h-[320px]")}>
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-fill text-muted [&>svg]:size-5">
        {icon ?? <Icon strokeWidth={1.75} aria-hidden />}
      </div>
      <h2 className="text-base font-semibold text-ink">{heading}</h2>
      {(description ?? d.description) && <p className="mt-1.5 max-w-[400px] text-sm text-muted">{description ?? d.description}</p>}
      {adminOnly && <p className="mt-1.5 max-w-[400px] text-sm text-muted">Ask an admin to {askAdmin}.</p>}
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actions.map(({ a, v }) => (
            <EmptyButton key={v} a={a} variant={v} defaultLabel={d.label} />
          ))}
        </div>
      )}
      {hint && <div className="mt-4 max-w-[400px] text-xs text-faint [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-ink">{hint}</div>}
    </div>
  );
  if (columns) {
    const grid = (
      <>
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c || "action"}>{c}</Th>
              ))}
            </tr>
          </thead>
        </Table>
        {body}
      </>
    );
    return inside ? grid : <div className="w-full overflow-hidden rounded-[12px] border border-line bg-surface">{grid}</div>;
  }
  if (inside) return body;
  return <div className="w-full rounded-[12px] border border-line bg-surface">{body}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-13 tabular-nums [&_tbody_tr:hover]:bg-hover">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cx("section-label whitespace-nowrap border-b border-line bg-fill px-4 py-2 text-faint", className)}>{children}</th>
  );
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-4 py-3 align-middle", className)}>{children}</td>;
}

export function Alert({ tone = "warning", children }: { tone?: "warning" | "danger" | "success" | "accent"; children: ReactNode }) {
  const t = {
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-accent-soft text-accent-text",
    accent: "bg-fill text-ink",
  }[tone];
  return <div className={cx("rounded-lg px-4 py-3 text-sm", t)}>{children}</div>;
}

/** Brief-style figure: mono label over a heavy value, ruled above. `accent` marks the key number. */
export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="pt-3">
      <div className="section-label text-faint">{label}</div>
      <div className={cx("type-stat mt-1 tabular-nums", accent ? "text-accent-text" : "text-ink")}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Side panel / dialog shell: hairline, flat, ink scrim. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-[var(--wf-scrim)]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** Initials in a fill circle. `size` is in px. */
export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={cx("flex shrink-0 items-center justify-center rounded-full bg-fill font-semibold text-ink", size < 30 ? "text-xs" : "text-13", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials || "#"}
    </div>
  );
}

/** Quiet footer for the end of a short list. */
export function EndOfList({ className }: { className?: string }) {
  return <li className={cx("list-none py-6 text-center text-xs text-faint", className)}>That&apos;s everything</li>;
}
