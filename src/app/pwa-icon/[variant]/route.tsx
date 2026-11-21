import { ImageResponse } from "next/og";
import { BRAND_INK, BRAND_ORANGE, MARK_INK, MARK_LIGHT, MARK_VIEWBOX } from "@/components/logo-mark";

const SIZES = { "192": 192, "512": 512, maskable: 512, badge: 96 } as const;

/** The mark in white on ink. Maskable keeps it inside the 80% safe zone; badge is a white silhouette for Android's status bar. */
function Mark({ size, variant }: { size: number; variant: keyof typeof SIZES }) {
  const badge = variant === "badge";
  const glyph = variant === "maskable" ? size * 0.46 : badge ? size * 0.86 : size * 0.58;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: badge ? "transparent" : BRAND_INK,
        borderRadius: variant === "maskable" || badge ? 0 : size * 0.18,
      }}
    >
      <svg width={glyph} height={glyph} viewBox={MARK_VIEWBOX}>
        <path d={MARK_INK} fill="#ffffff" />
        <rect x={MARK_LIGHT.x} y={MARK_LIGHT.y} width={MARK_LIGHT.size} height={MARK_LIGHT.size} fill={badge ? "#ffffff" : BRAND_ORANGE} />
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
