"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { SHORTCUTS } from "@/lib/shortcuts";
import { Kbd, useShortcut } from "@/components/shortcuts";

const SECTIONS: { title: string; rows: { label: string; keys: string[] }[] }[] =
  [
    {
      title: "Anywhere",
      rows: [
        { label: "Search", keys: [SHORTCUTS.search, SHORTCUTS.searchSlash] },
        { label: "Help for this page", keys: [SHORTCUTS.help] },
      ],
    },
    {
      title: "Search",
      rows: [
        { label: "Move between results", keys: [...SHORTCUTS.navigate] },
        { label: "Open", keys: [SHORTCUTS.open] },
        { label: "Open in a new tab", keys: [SHORTCUTS.openInNewTab] },
        { label: "Close", keys: [SHORTCUTS.close] },
      ],
    },
    {
      title: "Inbox composer",
      rows: [
        { label: "Send", keys: [SHORTCUTS.send] },
        { label: "New line", keys: [SHORTCUTS.newLine] },
      ],
    },
  ];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  useShortcut(SHORTCUTS.close, onClose, { inFields: true });
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgb(27_27_27/0.2)] dark:bg-black/50"
        onMouseDown={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="absolute left-1/2 top-[12vh] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.06)]"
      >
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-faint transition-surface hover:bg-fill hover:text-ink"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1.5 text-[12px] font-semibold leading-4 text-faint">
                {s.title}
              </h3>
              <ul className="divide-y divide-line">
                {s.rows.map((r) => (
                  <li
                    key={r.label}
                    className="flex items-center justify-between gap-4 py-2 text-sm text-ink"
                  >
                    <span>{r.label}</span>
                    <span className="flex items-center gap-2 text-xs text-faint">
                      {r.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-2">
                          {i > 0 && <span>or</span>}
                          <Kbd keys={k} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
