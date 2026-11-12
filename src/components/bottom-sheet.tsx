"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/components/help-drawer";
import { cx } from "@/components/ui";
import { haptic } from "@/lib/haptics";

const CLOSE_MS = 240;
const noopSubscribe = () => () => {};
/** A flick faster than this (px/ms) downward dismisses, wherever the sheet is. */
const FLICK = 0.6;

/**
 * Mobile sheet that slides up from the bottom: grabber, 16px top radius, drag the header down to dismiss.
 * `snaps` are heights as fractions of the viewport, smallest first (e.g. [0.5, 0.92]); without them the
 * sheet is as tall as its content, up to 92% of the screen. `full` makes it a full-screen sheet (search).
 */
export function BottomSheet({
  title,
  onClose,
  children,
  footer,
  snaps,
  full = false,
  hideTitle = false,
  bodyClassName,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky area under the scrolling body, padded for the home indicator. */
  footer?: ReactNode;
  snaps?: number[];
  full?: boolean;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  bodyClassName?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Client-only (it portals into <body>); false during a server render.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [vh] = useState(() => (typeof window === "undefined" ? 0 : window.innerHeight));
  const drag = useRef<{ y: number; start: number; lastY: number; lastT: number; v: number } | null>(null);
  const closing = useRef(false);

  const heights = full ? [1] : snaps?.length ? snaps : null;
  const max = heights ? heights[heights.length - 1] : 0;
  // Offsets (px from fully open) of each snap point.
  const stops = heights && vh ? heights.map((h) => (max - h) * vh) : [0];
  // Opens at the smallest snap, sliding up on the next frame.
  const [offset, setOffset] = useState(stops[0]);
  const [shown, setShown] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(f);
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [close]);
  useFocusTrap(panel, [mounted]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: offset, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const next = d.start + (e.clientY - d.y);
    // Past fully open the sheet resists instead of detaching.
    setOffset(next < 0 ? next * 0.25 : next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const height = panel.current?.offsetHeight ?? vh;
    const lowest = stops[0];
    if (d.v > FLICK || offset > lowest + Math.min(120, (height - lowest) * 0.35)) {
      haptic("swipe");
      return close();
    }
    // Nearest snap, nudged in the direction of the flick.
    const aim = offset + d.v * 120;
    const nearest = stops.reduce((a, b) => (Math.abs(b - aim) < Math.abs(a - aim) ? b : a), stops[0]);
    setOffset(nearest);
  };

  if (!mounted) return null;
  const sheetHeight = heights && vh ? max * vh : undefined;
  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden" role="presentation">
      <div
        aria-hidden
        onClick={close}
        className={cx("absolute inset-0 bg-[var(--wf-scrim)] transition-opacity duration-200 ease-out motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          height: sheetHeight,
          transform: shown ? `translateY(${Math.max(offset, -24)}px)` : "translateY(100%)",
          transition: dragging ? "none" : `transform ${shown ? 280 : CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        className={cx(
          "absolute inset-x-0 bottom-0 flex flex-col bg-surface outline-none motion-reduce:transition-none!",
          full ? "rounded-none pt-[env(safe-area-inset-top)]" : "max-h-[92dvh] rounded-t-2xl",
        )}
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!full && <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong" />}
          <div className={cx("flex min-h-12 items-center gap-2 px-4", hideTitle && "sr-only")}>
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={close}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close"
              className="tap -mr-2 grid size-11 place-items-center rounded-full text-muted active:bg-fill"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain", !footer && "pb-[env(safe-area-inset-bottom)]", bodyClassName)}>{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export type SheetAction = { label: string; description?: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** iOS-style action list inside a bottom sheet: 56px rows, an icon each, danger rows in red. */
export function ActionSheet({ title, actions, onClose }: { title: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      <ul className="px-2 pb-2">
        {actions.map((a) => (
          <li key={a.label}>
            <button
              type="button"
              disabled={a.disabled}
              onClick={() => {
                haptic("tap");
                onClose();
                a.onSelect();
              }}
              className={cx(
                "tap flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left active:bg-fill disabled:opacity-50",
                a.danger ? "text-danger" : "text-ink",
              )}
            >
              {a.icon && <span className={cx("grid size-9 shrink-0 place-items-center rounded-full bg-fill [&>svg]:size-[18px]", a.danger ? "text-danger" : "text-muted")}>{a.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{a.label}</span>
                {a.description && <span className="block truncate text-13 text-faint">{a.description}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
