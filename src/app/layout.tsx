import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import { ThemeColor } from "@/components/mobile/theme-color";
import "./globals.css";

// One family for everything, as on lighthouselabs.in: Inter, variable weight.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Harbor by LightHouse Labs", template: "%s · Harbor" },
  description: "The open-source WhatsApp CRM: shared inbox, bots, broadcasts and pipeline, on your own server.",
  applicationName: "Harbor",
  authors: [{ name: "LightHouse Labs" }],
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  appleWebApp: { capable: true, title: "Harbor", statusBarStyle: "default" },
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
    { media: "(prefers-color-scheme: dark)", color: "#1f1f23" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (e.g. ColorZilla's cz-shortcut-listen) write attributes onto
    // <html>/<body> before React hydrates; this only silences those two elements.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <ThemeColor />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
