import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const cx = clsx;

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};
const btnSize = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm" };

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        btn[variant],
        btnSize[size],
        className,
      )}
      {...p}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <Link
      className={cx("inline-flex items-center justify-center gap-2 rounded-md font-medium transition", btn[variant], btnSize[size], className)}
      {...p}
    />
  );
}

const field =
  "w-full rounded-md border border-line-input bg-surface px-3 text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-accent";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(field, "h-10", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(field, "py-2 min-h-24", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(field, "h-10", className)} {...p} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
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
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-surface-2 text-success",
  warning: "bg-surface-2 text-warning",
  danger: "bg-surface-2 text-danger",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
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
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ")}</Badge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-surface px-6 py-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-4 py-3 align-middle", className)}>{children}</td>;
}

export function Alert({ tone = "warning", children }: { tone?: "warning" | "danger" | "success" | "accent"; children: ReactNode }) {
  const t = { warning: "border-warning text-warning", danger: "border-danger text-danger", success: "border-success text-success", accent: "border-accent text-accent" }[tone];
  return <div className={cx("rounded-md border-l-4 bg-surface-2 px-4 py-3 text-sm", t)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
