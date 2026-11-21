import { ImageResponse } from "next/og";
import { BRAND_INK, BRAND_ORANGE, MARK_INK, MARK_LIGHT, MARK_VIEWBOX } from "@/components/logo-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home Screen icon for iOS: the mark in white on ink. iOS rounds the corners itself, so the ink runs to the edge. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_INK }}>
        <svg width={104} height={104} viewBox={MARK_VIEWBOX}>
          <path d={MARK_INK} fill="#ffffff" />
          <rect x={MARK_LIGHT.x} y={MARK_LIGHT.y} width={MARK_LIGHT.size} height={MARK_LIGHT.size} fill={BRAND_ORANGE} />
        </svg>
      </div>
    ),
    size,
  );
}
