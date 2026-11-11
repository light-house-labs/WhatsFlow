"use client";

import { useEffect } from "react";

/**
 * Opening a setting from search: wait for the page, scroll to its card, focus the field and flash it
 * green for a second. A new tab carries the target in the hash as `#<card id>/<field>`, which no
 * element has, so the browser leaves the scrolling to us.
 */
export type Target = { anchor?: string; field?: string };

const WAIT_MS = 5000;
let job = 0;

export function targetHash(t: Target) {
  return `#${t.anchor ?? ""}/${t.field ?? ""}`;
}

function findField(root: ParentNode, field: string): HTMLElement | null {
  const byId = document.getElementById(field);
  if (byId && (root === document || (root as Element).contains(byId))) return byId;
  const named = [...root.querySelectorAll<HTMLElement>(`[name="${CSS.escape(field)}"]:not([type="hidden"])`)];
  return named.find((el) => !el.closest("[inert]")) ?? named[0] ?? null;
}

function flash(el: HTMLElement) {
  el.classList.remove("search-flash");
  void el.offsetWidth; // restart the animation if it is already running
  el.classList.add("search-flash");
  el.addEventListener("animationend", () => el.classList.remove("search-flash"), { once: true });
}

/** Run once the browser is on `path` and the card (or field) is in the DOM. Gives up after five seconds. */
export function focusTarget({ path, anchor, field }: Target & { path: string }) {
  const id = ++job;
  const until = Date.now() + WAIT_MS;
  const tick = () => {
    if (id !== job || Date.now() > until) return;
    if (location.pathname !== path) return void requestAnimationFrame(tick);
    const card = anchor ? document.getElementById(anchor) : null;
    if (anchor && !card) return void requestAnimationFrame(tick);
    let el = field ? findField(card ?? document, field) : null;
    if (field && !el && !card) return void requestAnimationFrame(tick);
    // A field inside a switched-off toggle can't take focus: focus the switch it belongs to instead.
    if (el?.closest("[inert]")) el = (el.closest("[inert]")?.parentElement?.querySelector<HTMLElement>('input[role="switch"]') ?? el) as HTMLElement;
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
      flash((el.closest("[data-search-field]") as HTMLElement | null) ?? el.parentElement ?? el);
    } else if (card) {
      card.scrollIntoView({ block: "start", behavior: "smooth" });
      flash(card);
    }
  };
  requestAnimationFrame(tick);
}

/** Picks up a target from the URL when a setting was opened in a new tab, then tidies the hash. */
export function SearchTargetOnLoad() {
  useEffect(() => {
    const raw = decodeURIComponent(location.hash.slice(1));
    const slash = raw.indexOf("/");
    if (slash < 0) return;
    const anchor = raw.slice(0, slash) || undefined;
    const field = raw.slice(slash + 1) || undefined;
    history.replaceState(history.state, "", location.pathname + location.search + (anchor ? `#${anchor}` : ""));
    focusTarget({ path: location.pathname, anchor, field });
  }, []);
  return null;
}
