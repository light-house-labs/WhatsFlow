"use client";

import { useSyncExternalStore } from "react";

/** Layout breakpoints, matching Tailwind's md (768) and lg (1024). */
export type Viewport = "mobile" | "tablet" | "desktop";

const MOBILE = "(max-width: 767.98px)";
const TABLET = "(min-width: 768px) and (max-width: 1023.98px)";

function read(): Viewport {
  if (matchMedia(MOBILE).matches) return "mobile";
  if (matchMedia(TABLET).matches) return "tablet";
  return "desktop";
}

function subscribe(cb: () => void) {
  const qs = [matchMedia(MOBILE), matchMedia(TABLET)];
  qs.forEach((q) => q.addEventListener("change", cb));
  return () => qs.forEach((q) => q.removeEventListener("change", cb));
}

/**
 * Which layout the window is in. `null` on the server and during hydration, so a component that renders a
 * different tree per layout can show a neutral placeholder instead of flashing the wrong one.
 * For styling alone, use the md:/lg: variants instead; this is for swapping whole components.
 */
export function useViewport(): Viewport | null {
  return useSyncExternalStore<Viewport | null>(subscribe, read, () => null);
}
