"use client";

import { useEffect, useRef } from "react";

/**
 * Call `fn` now and then every `ms`. Polls never overlap (a slow answer delays
 * the next one instead of stacking), stop while the tab is hidden, and catch up
 * the moment it is shown again.
 */
export function usePoll(fn: () => Promise<unknown>, ms: number) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  }, [fn]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let running = false;
    const tick = async () => {
      if (stopped || running) return;
      clearTimeout(timer);
      running = true;
      try {
        await latest.current();
      } catch {
        // the caller reports its own errors; keep polling
      }
      running = false;
      if (!stopped && !document.hidden) timer = setTimeout(tick, ms);
    };
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    timer = setTimeout(tick, 0);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // restart when the thing being polled changes (fn identity), not on every render
  }, [fn, ms]);
}
