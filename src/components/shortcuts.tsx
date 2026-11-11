"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePlatform } from "@/lib/platform";
import {
  comboLabels,
  isEditable,
  matchCombo,
  parseCombo,
  type Combo,
} from "@/lib/shortcuts";

/** (event, combo) => does it match on this platform. For handlers that already live on an element (a textarea, the palette). */
export function useShortcutMatcher() {
  const { isApple } = usePlatform();
  return useCallback(
    (e: Parameters<typeof matchCombo>[0], combo: Combo) =>
      matchCombo(e, combo, isApple),
    [isApple],
  );
}

/**
 * Window-level shortcut. Combos with no modifier ("/", "shift+/") are ignored while typing in a field;
 * pass `inFields` to override. A match calls preventDefault.
 */
export function useShortcut(
  combo: Combo,
  handler: (e: KeyboardEvent) => void,
  opts: { enabled?: boolean; inFields?: boolean } = {},
) {
  const { isApple } = usePlatform();
  const { enabled = true, inFields } = opts;
  const fn = useRef(handler);
  useEffect(() => {
    fn.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const c = parseCombo(combo);
    const allowInFields =
      inFields ?? (c.mod || c.ctrl || c.alt || c.key === "esc");
    const onKey = (e: KeyboardEvent) => {
      if (!matchCombo(e, combo, isApple)) return;
      if (!allowInFields && isEditable(e.target)) return;
      e.preventDefault();
      fn.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, isApple, enabled, inFields]);
}

const CHIP =
  "inline-grid h-[18px] min-w-[18px] place-items-center rounded-xs border border-line-strong bg-surface px-1 font-sans text-[11px] font-semibold leading-none text-ink";

/** Renders a shortcut for the current platform; nothing at all on touch-only devices. */
export function Kbd({
  keys,
  variant = "chip",
  className,
}: {
  keys: Combo;
  variant?: "chip" | "plain";
  className?: string;
}) {
  const { isApple, isTouchOnly } = usePlatform();
  if (isTouchOnly) return null;
  const labels = comboLabels(keys, isApple);
  if (variant === "plain") {
    return (
      <kbd className={className ?? "shrink-0 font-sans text-xs text-faint"}>
        {labels.join(isApple ? "" : " ")}
      </kbd>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {labels.map((l, i) => (
        <kbd key={i} className={CHIP}>
          {l}
        </kbd>
      ))}
    </span>
  );
}

/** Hover/focus tooltip: a label plus an optional shortcut. The shortcut disappears on touch-only devices. */
export function Tip({
  label,
  keys,
  children,
  side = "bottom",
  className = "inline-flex",
}: {
  label: string;
  keys?: Combo;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={`group/tip relative ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-surface opacity-0 shadow-sm transition-opacity delay-300 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 max-md:hidden ${side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
      >
        {label}
        {keys && <Kbd keys={keys} />}
      </span>
    </span>
  );
}
