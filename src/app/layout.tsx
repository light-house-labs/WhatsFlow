import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import { ThemeColor } from "@/components/mobile/theme-color";
import "./globals.css";

// Display face: logo and landing page only.
const display = Inter_Tight({ variable: "--font-display-face", subsets: ["latin"], weight: ["800", "900"] });

export const metadata: Metadata = {
  title: { default: "WhatsFlow", template: "%s · WhatsFlow" },
  description: "The honest WhatsApp CRM: shared inbox, bots, broadcasts and pipeline. Real people, one-click cancel.",
  applicationName: "WhatsFlow",
  appleWebApp: { capable: true, title: "WhatsFlow", statusBarStyle: "default" },
};

// viewport-fit=cover lets the mobile shell paint under the notch and pad back with env(safe-area-inset-*).
// resizes-content makes Android's keyboard shrink the layout like iOS, so the docked composer stays visible.
// Zoom stays enabled: inputs are 16px on touch screens, which is what stops iOS from zooming on focus.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  // Matches the mobile header (bg-surface). ThemeColor keeps it in step with the in-app theme toggle.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#26272b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (e.g. ColorZilla's cz-shortcut-listen) write attributes onto
    // <html>/<body> before React hydrates; this only silences those two elements.
    <html lang="en" className={`${GeistSans.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <ThemeColor />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
