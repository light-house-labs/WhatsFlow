"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourId } from "@/lib/help/content";
import { SHORTCUTS } from "@/lib/shortcuts";
import { useShortcut } from "@/components/shortcuts";
import { useFocusTrap, useHelp } from "@/components/help-drawer";

export type TourStep = {
  /** CSS selectors tried in order; the first one on screen is spotlit. */
  target: string[];
  title: string;
  body: string;
  side: "right" | "left" | "bottom";
};

const EVENT = "wf:tour";
const PAD = 6;
const GAP = 12;
const EDGE = 12;
const WIDTH = 300;

/** Replays a tour on the current screen (from the help drawer). */
export function startTour(id: TourId) {
  window.dispatchEvent(new CustomEvent<TourId>(EVENT, { detail: id }));
}

const flagKey = (id: TourId, userId: string) => `wf:tour:${id}:${userId}`;

function seen(id: TourId, userId: string): boolean {
  try {
    return localStorage.getItem(flagKey(id, userId)) !== null;
  } catch {
    // No storage (private window): don't nag on every visit.
    return true;
  }
}

function markSeen(id: TourId, userId: string) {
  try {
    localStorage.setItem(flagKey(id, userId), new Date().toISOString());
  } catch {}
}

function find(step: TourStep): HTMLElement | null {
  for (const sel of step.target) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

/**
 * Spotlight tour: dims the screen except one element and explains it in a popover. Runs once per user
 * per tour (remembered in this browser), and again whenever `startTour(id)` is called.
 */
export function Tour({ id, steps, delayMs = 400 }: { id: TourId; steps: TourStep[]; delayMs?: number }) {
  const { userId } = useHelp();
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const t = seen(id, userId) ? null : setTimeout(() => setAt(0), delayMs);
    const onStart = (e: Event) => {
      if ((e as CustomEvent<TourId>).detail === id) setAt(0);
    };
    window.addEventListener(EVENT, onStart);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener(EVENT, onStart);
    };
  }, [id, userId, delayMs]);

  const finish = useCallback(() => {
    markSeen(id, userId);
    setAt(null);
  }, [id, userId]);

  if (at === null) return null;
  return (
    <Spotlight
      key={at}
      step={steps[at]}
      index={at}
      total={steps.length}
      onNext={() => (at + 1 < steps.length ? setAt(at + 1) : finish())}
      onSkip={finish}
    />
  );
}

type Box = { top: number; left: number; width: number; height: number };

function Spotlight({ step, index, total, onNext, onSkip }: { step: TourStep; index: number; total: number; onNext: () => void; onSkip: () => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  useShortcut(SHORTCUTS.close, onSkip, { inFields: true });
  useFocusTrap(pop);

  // Follow the target through resizes and scrolling.
  useEffect(() => {
    const measure = () => {
      const el = find(step);
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    find(step)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Place the popover beside the target, kept on screen; centred when the target can't be found.
  useLayoutEffect(() => {
    const h = pop.current?.offsetHeight ?? 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, max: number) => Math.min(Math.max(v, EDGE), max - EDGE);
    if (!box) {
      setPos({ top: vh / 2 - h / 2, left: vw / 2 - WIDTH / 2 });
      return;
    }
    let side = step.side;
    if (side === "right" && box.left + box.width + GAP + WIDTH > vw - EDGE) side = "left";
    if (side === "left" && box.left - GAP - WIDTH < EDGE) side = "bottom";
    const top =
      side === "bottom" ? box.top + box.height + GAP : clamp(box.top, vh - h);
    const left =
      side === "right" ? box.left + box.width + GAP : side === "left" ? box.left - GAP - WIDTH : clamp(box.left + box.width - WIDTH, vw - WIDTH);
    setPos({ top: Math.min(top, vh - h - EDGE), left });
  }, [box, step.side]);

  const last = index === total - 1;
  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Blocks clicks while the tour is up; the dimming comes from the spotlight's shadow. */}
      <div aria-hidden className={box ? "absolute inset-0" : "absolute inset-0 bg-[var(--wf-scrim)]"} />
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg shadow-[0_0_0_9999px_var(--wf-scrim)] ring-2 ring-accent transition-all duration-200 ease-out motion-reduce:transition-none"
          style={box}
        />
      )}
      <div
        ref={pop}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute rounded-xl border border-line bg-surface p-4 shadow-[0_16px_48px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.06)]"
        style={{ width: WIDTH, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      >
        <div className="text-xs font-medium tabular-nums text-faint">
          Step {index + 1} of {total}
        </div>
        <h2 id="tour-title" className="mt-1 text-sm font-semibold text-ink">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1 text-13 text-muted">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1 w-4 rounded-full ${i <= index ? "bg-accent" : "bg-fill"}`} />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {!last && (
              <button type="button" onClick={onSkip} className="h-8 rounded-md px-2 text-13 font-medium text-muted transition-surface hover:bg-fill hover:text-ink">
                Skip
              </button>
            )}
            <button
              type="button"
              data-autofocus
              onClick={onNext}
              className="h-8 rounded-md bg-accent px-3 text-13 font-medium text-on-accent transition-surface hover:bg-accent-hover"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
