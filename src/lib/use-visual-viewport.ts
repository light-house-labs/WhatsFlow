"use client";

import { useEffect } from "react";

/**
 * Publishes the visible viewport as CSS variables on <html>: --vv-h (height) and --vv-top (offset).
 * iOS Safari keeps the layout viewport the same size when the keyboard opens, so a screen that must keep
 * its composer above the keyboard sizes itself with these instead of 100dvh. Also sets <html data-kb> while the keyboard is up.
 */
export function useVisualViewport(enabled = true) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--vv-h", `${vv.height}px`);
        root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
        // Keyboard up: the home-indicator inset no longer applies, so docked bars drop that padding.
        if (window.innerHeight - vv.height > 120) root.dataset.kb = "1";
        else delete root.dataset.kb;
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--vv-h");
      root.style.removeProperty("--vv-top");
      delete root.dataset.kb;
    };
  }, [enabled]);
}
