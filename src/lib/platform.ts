"use client";

import { useMemo, useSyncExternalStore } from "react";

const APPLE = 1;
const TOUCH = 2;

type Nav = Navigator & { userAgentData?: { platform?: string } };

function read(): number {
  const nav = navigator as Nav;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  let bits = 0;
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) bits |= APPLE;
  // Touch-only: the primary pointer is coarse and nothing finer (mouse, trackpad) is attached, so no hardware keyboard to hint at.
  if (
    matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(any-pointer: fine)").matches
  )
    bits |= TOUCH;
  return bits;
}

function subscribe(cb: () => void) {
  const queries = [
    matchMedia("(pointer: coarse)"),
    matchMedia("(any-pointer: fine)"),
  ];
  queries.forEach((q) => q.addEventListener("change", cb));
  return () => queries.forEach((q) => q.removeEventListener("change", cb));
}

/** Server and first client render report non-Apple, non-touch; the real values arrive after hydration without a mismatch. */
export function usePlatform(): { isApple: boolean; isTouchOnly: boolean } {
  const bits = useSyncExternalStore(subscribe, read, () => 0);
  return useMemo(
    () => ({
      isApple: (bits & APPLE) !== 0,
      isTouchOnly: (bits & TOUCH) !== 0,
    }),
    [bits],
  );
}
