import Link from "next/link";
import type { AudienceSummary } from "@/lib/segments";
import { formatWaId } from "@/lib/phone";

/** What a list holds: size, opted-out count, the filter in words and the first few people. */
export function AudiencePreview({ summary, marketing = true }: { summary: AudienceSummary; marketing?: boolean }) {
  const { total, optedOut, criteria, sample, href } = summary;
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular-nums">
          <strong>{total}</strong> {total === 1 ? "contact" : "contacts"}
        </span>
        <span className="tabular-nums text-muted">
          {optedOut} opted out{marketing && optedOut > 0 ? " (excluded from offers)" : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">Who: {criteria}.</p>
      {sample.length > 0 ? (
        <ul className="mt-2 divide-y divide-line">
          {sample.map((p) => (
            <li key={p.id} className="flex justify-between gap-3 py-1">
              <span className="truncate">{p.name || "Unnamed"}</span>
              <span className="shrink-0 tabular-nums text-muted">{formatWaId(p.waId)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">Nobody matches yet.</p>
      )}
      {total > sample.length && (
        <Link className="link mt-2 inline-block text-xs" href={href}>
          View all {total}
        </Link>
      )}
    </div>
  );
}
