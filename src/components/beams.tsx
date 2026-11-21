/**
 * Light beams behind the landing hero: rays from a point above the page, the
 * way a harbour light sweeps the water. Generated, not drawn: `count` rays at
 * even angles, every `accentEvery`-th one in brand orange, the rest ink, with
 * lengths varied by a fixed pattern so the result is identical on every render
 * (no Math.random, so server and client markup match).
 */
export function Beams({ count = 72, accentEvery = 9, className }: { count?: number; accentEvery?: number; className?: string }) {
  const cx = 600;
  const cy = 420;
  const rays = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const inner = 250 + ((i * 37) % 5) * 18; // leave the headline clear
    const outer = inner + 160 + ((i * 53) % 7) * 28;
    const accent = i % accentEvery === 3;
    return {
      key: i,
      x1: cx + Math.cos(angle) * inner,
      y1: cy + Math.sin(angle) * inner,
      x2: cx + Math.cos(angle) * outer,
      y2: cy + Math.sin(angle) * outer,
      accent,
    };
  });
  return (
    <svg viewBox="0 0 1200 840" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      <defs>
        <radialGradient id="beam-fade" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="beam-mask">
          <rect width="1200" height="840" fill="url(#beam-fade)" />
        </mask>
      </defs>
      <g mask="url(#beam-mask)" strokeWidth="1.25" strokeLinecap="round">
        <circle cx={cx} cy={cy} r="236" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 6" />
        {rays.map((r) => (
          <line key={r.key} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={r.accent ? "var(--wf-brand)" : "currentColor"} strokeOpacity={r.accent ? 0.45 : 0.08} />
        ))}
      </g>
    </svg>
  );
}
