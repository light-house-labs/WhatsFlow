"use client";

import { createContext, useContext, useMemo, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, RotateCw } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { useSaveState, type SaveResult, type SaveState, type SaveStatus } from "@/lib/use-save-state";

/** `active` is the value of the submit button that was pressed, for forms with more than one. */
const FormCtx = createContext<(SaveState & { active: string | null }) | null>(null);

/** The save state of the enclosing <SaveForm>, if any. */
export const useSaveForm = () => useContext(FormCtx);

type BtnProps = Omit<ComponentProps<typeof Button>, "children" | "type"> & { children?: ReactNode; savingLabel?: string; savedLabel?: string };

/** A submit button that shows idle, saving (spinner, disabled), saved (check, 2s) and error (submits the current fields again). */
export function SaveButton({
  status,
  children = "Save",
  savingLabel = "Saving…",
  savedLabel = "Saved",
  disabled,
  className,
  ...p
}: BtnProps & { status: SaveStatus }) {
  const saving = status === "saving";
  return (
    <Button
      {...p}
      type="submit"
      disabled={disabled || saving}
      aria-busy={saving}
      className={cx("min-w-24", className)}
    >
      {saving ? (
        <>
          <Loader2 size={14} strokeWidth={1.75} aria-hidden className="animate-spin" /> {savingLabel}
        </>
      ) : status === "saved" ? (
        <>
          <Check size={14} strokeWidth={2} aria-hidden /> {savedLabel}
        </>
      ) : status === "error" ? (
        <>
          <RotateCw size={14} strokeWidth={1.75} aria-hidden /> Try again
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Drop-in for `<form action={…}>`: runs the action itself so the form can show saving, saved and error,
 * and raise a toast. Pair it with <SubmitButton>. The action may throw or return `{ error }`.
 */
export function SaveForm({
  action,
  success,
  resetOnSuccess = false,
  onSaved,
  children,
  hideError = false,
  ...p
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (form: FormData) => Promise<SaveResult> | SaveResult;
  /** Toast text on success. */
  success?: string;
  /** Clear the fields after a successful save, for "add another" forms. */
  resetOnSuccess?: boolean;
  onSaved?: () => void;
  /** Skip the inline error line, when the form shows the error itself. */
  hideError?: boolean;
}) {
  const state = useSaveState({ success });
  const [active, setActive] = useState<string | null>(null);
  const ctx = useMemo(() => ({ ...state, active }), [state, active]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(form, submitter);
    setActive(submitter?.value ?? null);
    void state.run(async () => {
      const r = await action(data);
      if (!(r && typeof r === "object" && r.error)) {
        if (resetOnSuccess) form.reset();
        onSaved?.();
      }
      return r;
    });
  };
  return (
    <FormCtx.Provider value={ctx}>
      <form {...p} onSubmit={submit}>
        {children}
        {!hideError && state.error && (
          <p role="alert" className="mt-2 text-13 text-danger sm:col-span-2">
            {state.error}
          </p>
        )}
      </form>
    </FormCtx.Provider>
  );
}

/** Submit button for a <SaveForm>. Outside one it still disables itself while the form submits. */
export function SubmitButton({ children = "Save", ...p }: BtnProps) {
  const form = useSaveForm();
  const { pending } = useFormStatus();
  // with two submit buttons, only the one that was pressed shows the result
  const mine = !form || form.active === null || form.active === (p.value == null ? null : String(p.value));
  const status = form ? (mine ? form.status : "idle") : pending ? "saving" : "idle";
  return (
    <SaveButton {...p} status={status} disabled={p.disabled || (form?.status === "saving" && !mine)}>
      {children}
    </SaveButton>
  );
}
