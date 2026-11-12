"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const COLORS = { light: "#ffffff", dark: "#26272b" } as const;

/**
 * The theme is a class on <html> (next-themes), not the OS setting, so the per-scheme theme-color tags can
 * disagree with what's on screen. Point both at the active theme's header colour.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color = COLORS[resolvedTheme === "dark" ? "dark" : "light"];
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme]);
  return null;
}
