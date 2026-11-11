"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
/** What a save returns. A server action can return `{ error }` instead of throwing, so the message reaches the user. */
export type SaveResult = void | { error?: string } | null | undefined;

const SAVED_MS = 2000;
const GENERIC = "Couldn't save. Check your connection and try again.";

class SaveError extends Error {}

/**
 * One save lifecycle for every form: idle, saving, saved (for 2s), error (with a message and retry).
 * Also raises a toast on success and on failure.
 */
export function useSaveState(opts: { success?: string } = {}) {
  const toast = useToast();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const last = useRef<(() => Promise<SaveResult>) | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const success = useRef(opts.success);
  const again = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => {
    success.current = opts.success;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    async (fn: () => Promise<SaveResult>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      last.current = fn;
      clearTimeout(timer.current);
      setStatus("saving");
      setError(null);
      try {
        const r = await fn();
        if (r && typeof r === "object" && r.error) throw new SaveError(r.error);
        setStatus("saved");
        toast.success(success.current ?? "Saved");
        timer.current = setTimeout(() => setStatus("idle"), SAVED_MS);
        return true;
      } catch (e) {
        const message = e instanceof SaveError ? e.message : GENERIC;
        setStatus("error");
        setError(message);
        toast.error(message, { label: "Retry", onClick: () => void again.current() });
        return false;
      } finally {
        busy.current = false;
      }
    },
    [toast],
  );
  useEffect(() => {
    again.current = async () => (last.current ? run(last.current) : false);
  }, [run]);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setStatus("idle");
    setError(null);
  }, []);
  const retry = useCallback(() => again.current(), []);

  return { status, error, run, retry, reset };
}

export type SaveState = ReturnType<typeof useSaveState>;
