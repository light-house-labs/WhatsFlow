import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home Screen icon for iOS. iOS rounds the corners itself, so the green runs to the edge. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#239641" }}>
        <svg width={112} height={112} viewBox="6 6 20 20">
          <path d="M8 11c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3v6c0 1.7-1.3 3-3 3h-6l-4.5 3.6c-.6.5-1.5 0-1.5-.8V20c-.6-.5-1-1.2-1-2v-7z" fill="#ffffff" />
          <path d="M11.5 14.5h3m3 0h3" stroke="#239641" strokeWidth="2" strokeLinecap="square" />
        </svg>
      </div>
    ),
    size,
  );
}
