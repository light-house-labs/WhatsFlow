import { ImageResponse } from "next/og";

const GREEN = "#239641";
const SIZES = { "192": 192, "512": 512, maskable: 512, badge: 96 } as const;

/** The logo's speech bubble on the brand green. Maskable keeps it inside the 80% safe zone; badge is a white silhouette for Android's status bar. */
function Mark({ size, variant }: { size: number; variant: keyof typeof SIZES }) {
  const badge = variant === "badge";
  const glyph = variant === "maskable" ? size * 0.5 : badge ? size * 0.9 : size * 0.66;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: badge ? "transparent" : GREEN,
        borderRadius: variant === "maskable" || badge ? 0 : size * 0.18,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="6 6 20 20">
        <path d="M8 11c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3v6c0 1.7-1.3 3-3 3h-6l-4.5 3.6c-.6.5-1.5 0-1.5-.8V20c-.6-.5-1-1.2-1-2v-7z" fill="#ffffff" />
        {!badge && <path d="M11.5 14.5h3m3 0h3" stroke={GREEN} strokeWidth="2" strokeLinecap="square" />}
      </svg>
    </div>
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!(variant in SIZES)) return new Response("Not found", { status: 404 });
  const v = variant as keyof typeof SIZES;
  const size = SIZES[v];
  return new ImageResponse(<Mark size={size} variant={v} />, {
    width: size,
    height: size,
    headers: { "cache-control": "public, max-age=604800, immutable" },
  });
}
