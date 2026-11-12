/**
 * Direction of the next page transition on mobile: push slides the new screen in from the right, pop slides it
 * back out. Stored on <html data-nav> so the ::view-transition CSS can read it; the browser back button and
 * the edge swipe set "pop" through the popstate listener in the mobile shell.
 */
export type NavDirection = "push" | "pop" | "none";

export function setNavDirection(dir: NavDirection) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.nav = dir;
}
