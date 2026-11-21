import { MARK_INK, MARK_LIGHT, MARK_VIEWBOX } from "./logo-mark";

/** The Harbor mark alone. Ink follows the text colour, so it works in both themes. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} aria-hidden="true" className={className}>
      <path d={MARK_INK} fill="currentColor" />
      <rect x={MARK_LIGHT.x} y={MARK_LIGHT.y} width={MARK_LIGHT.size} height={MARK_LIGHT.size} fill="var(--wf-brand)" />
    </svg>
  );
}

export function Logo({ compact = false, byline = false, className = "text-ink" }: { compact?: boolean; /** Add "by LightHouse Labs" under the name. */ byline?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={byline ? 28 : 24} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[16px] font-semibold uppercase tracking-[0.04em]">Harbor</span>
          {byline && <span className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">by LightHouse Labs</span>}
        </span>
      )}
    </span>
  );
}
