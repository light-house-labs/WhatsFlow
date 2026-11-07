export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-ink">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-accent" />
        <path d="M8 11c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3v6c0 1.7-1.3 3-3 3h-6l-4.5 3.6c-.6.5-1.5 0-1.5-.8V20c-.6-.5-1-1.2-1-2v-7z" className="fill-on-accent" />
        <path d="M11.5 14.5h3m3 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent" />
      </svg>
      {!compact && <span className="text-[17px] tracking-tight">WhatsFlow</span>}
    </span>
  );
}
