"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/** Light by default; the choice is stored under `wf-theme`. next-themes injects the pre-paint script, so there is no flash. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem={false} storageKey="wf-theme" disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
