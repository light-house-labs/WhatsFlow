import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

// Display face: logo and landing page only.
const display = Inter_Tight({ variable: "--font-display-face", subsets: ["latin"], weight: ["800", "900"] });

export const metadata: Metadata = {
  title: { default: "WhatsFlow", template: "%s · WhatsFlow" },
  description: "The honest WhatsApp CRM: shared inbox, bots, broadcasts and pipeline. Real people, one-click cancel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (e.g. ColorZilla's cz-shortcut-listen) write attributes onto
    // <html>/<body> before React hydrates; this only silences those two elements.
    <html lang="en" className={`${GeistSans.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
