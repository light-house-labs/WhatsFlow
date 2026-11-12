/** Short vibration where the browser supports it (Android Chrome). iOS Safari has no Vibration API, so this is a no-op there. */
type Kind = "tap" | "send" | "swipe" | "longPress" | "error";
const PATTERNS: Record<Kind, number | number[]> = { tap: 8, send: 12, swipe: 10, longPress: 18, error: [20, 40, 20] };

export function haptic(kind: Kind = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {}
}
