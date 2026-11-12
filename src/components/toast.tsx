"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { cx } from "@/components/ui";

type ToastItem = { id: number; tone: "success" | "error"; message: string; action?: { label: string; onClick: () => void } };
type Api = {
  success: (message: string) => void;
  error: (message: string, action?: ToastItem["action"]) => void;
};

const noop: Api = { success: () => {}, error: () => {} };
const Ctx = createContext<Api>(noop);

/** Toasts for save results. Outside a provider the calls do nothing. */
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { ...t, id }]);
      // errors stay long enough to read and use the retry
      setTimeout(() => dismiss(id), t.tone === "error" ? 10_000 : 4_000);
    },
    [dismiss],
  );
  const api = useMemo<Api>(
    () => ({ success: (message) => push({ tone: "success", message }), error: (message, action) => push({ tone: "error", message, action }) }),
    [push],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6 max-md:bottom-[calc(72px+env(safe-area-inset-bottom))] max-md:items-center">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-surface px-3.5 py-3 text-sm text-ink shadow-menu",
              t.tone === "error" ? "border-danger" : "border-line",
            )}
          >
            {t.tone === "error" ? <AlertCircle size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-danger" /> : <Check size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="link shrink-0 font-medium"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="shrink-0 text-muted hover:text-ink">
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
