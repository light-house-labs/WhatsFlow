"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ArrowRight, CircleHelp, Keyboard, LifeBuoy, Play, X } from "lucide-react";
import { helpFor } from "@/lib/help/content";
import { SHORTCUTS } from "@/lib/shortcuts";
import { Kbd, Tip, useShortcut } from "@/components/shortcuts";
import { ShortcutSheet } from "@/components/shortcut-sheet";
import { startTour } from "@/components/tour";

type HelpCtx = { open: () => void; userId: string };
const Ctx = createContext<HelpCtx>({ open: () => {}, userId: "" });

/** Opens this page's help drawer, and knows who is signed in (tours remember per user). */
export function useHelp() {
  return useContext(Ctx);
}

/** Owns the help drawer and the shortcut sheet. "?" outside a text field opens help for the current route. */
export function HelpProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const ctx = useMemo(() => ({ open: () => setOpen(true), userId }), [userId]);
  useShortcut(SHORTCUTS.help, () => setOpen((o) => !o), { enabled: !sheet });
  return (
    <Ctx.Provider value={ctx}>
      {children}
      {open && (
        <HelpDrawer
          onClose={() => setOpen(false)}
          onShortcuts={() => {
            setOpen(false);
            setSheet(true);
          }}
        />
      )}
      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}
    </Ctx.Provider>
  );
}

/** The "?" at the far right of a page header. */
export function HelpButton({ className }: { className?: string }) {
  const { open } = useHelp();
  return (
    <Tip label="Help" keys={SHORTCUTS.help} className={clsx("inline-flex", className)}>
      <button
        type="button"
        onClick={open}
        aria-label="Help for this page"
        aria-haspopup="dialog"
        aria-keyshortcuts="Shift+?"
        className="grid size-8 place-items-center rounded-md text-muted transition-surface hover:bg-fill hover:text-ink"
      >
        <CircleHelp size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </Tip>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while mounted, focuses its first control, and hands focus back on unmount. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    (root.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? root).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return e.preventDefault();
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function HelpDrawer({ onClose, onShortcuts }: { onClose: () => void; onShortcuts: () => void }) {
  const path = usePathname();
  const h = helpFor(path);
  const panel = useRef<HTMLDivElement>(null);
  useShortcut(SHORTCUTS.close, onClose, { inFields: true });
  useFocusTrap(panel);
  const takeTour = useCallback(() => {
    onClose();
    if (h.tour) startTour(h.tour);
  }, [h.tour, onClose]);

  const heading = "mb-2 text-[12px] font-semibold leading-4 text-faint";
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-[var(--wf-scrim)]" onMouseDown={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-[400px] max-w-full flex-col border-l border-line bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.16)] outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
          <div className="min-w-0">
            <div className="text-xs text-faint">Help</div>
            <h2 id="help-title" className="truncate text-sm font-semibold text-ink">
              {h.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close help"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-md text-faint transition-surface hover:bg-fill hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <p className="text-sm text-ink">{h.purpose}</p>

          {h.tour && (
            <button
              type="button"
              onClick={takeTour}
              className="flex w-full items-center gap-3 rounded-lg bg-fill px-3 py-2.5 text-left transition-surface hover:bg-hover"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                <Play size={12} strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-medium text-ink">Take the tour</span>
                <span className="block text-xs text-muted">Five quick steps around this screen</span>
              </span>
              <ArrowRight size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
            </button>
          )}

          <section>
            <h3 className={heading}>How to</h3>
            <ol className="space-y-3">
              {h.howTo.map((s, i) => (
                <li key={s.step} className="flex gap-3">
                  <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-fill text-xs font-semibold tabular-nums text-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{s.step}</div>
                    <p className="mt-0.5 text-13 text-muted">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {h.tips.length > 0 && (
            <section>
              <h3 className={heading}>Tips</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-13 text-muted marker:text-faint">
                {h.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className={heading}>Shortcuts</h3>
            <ul className="divide-y divide-line">
              {[...h.shortcuts, { label: "Help for this page", keys: SHORTCUTS.help }].map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 py-2 text-13 text-ink">
                  <span>{s.label}</span>
                  <Kbd keys={s.keys} />
                </li>
              ))}
            </ul>
            <button type="button" onClick={onShortcuts} className="link mt-2 inline-flex items-center gap-1.5 text-13">
              <Keyboard size={14} strokeWidth={1.75} aria-hidden />
              All keyboard shortcuts
            </button>
          </section>

          {h.links.length > 0 && (
            <section>
              <h3 className={heading}>Related</h3>
              <ul className="space-y-1">
                {h.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} onClick={onClose} className="link text-13">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-13 text-muted">Still stuck?</span>
          <Link
            href="/support"
            onClick={onClose}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-13 font-medium text-ink transition-surface hover:bg-fill"
          >
            <LifeBuoy size={14} strokeWidth={1.75} aria-hidden />
            Talk to a person
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
