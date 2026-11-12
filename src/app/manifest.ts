import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhatsFlow",
    short_name: "WhatsFlow",
    description: "Shared WhatsApp inbox, bots, broadcasts and pipeline.",
    id: "/inbox",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches the mobile header and tab bar (bg-surface) so the status bar and splash blend in.
    theme_color: "#ffffff",
    background_color: "#f7f7f8",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
