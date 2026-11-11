"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Check, CheckCheck, ChevronDown } from "lucide-react";
import { cx } from "@/components/ui";
import { SaveButton } from "@/components/save-form";
import { useSaveState, type SaveResult } from "@/lib/use-save-state";

/** Next.js has no route-change events, so the unsaved-changes warning catches link clicks and tab close. One guard serves every card on the page. */
const LEAVE = "You have unsaved changes. Leave without saving?";
const dirtyCards = new Set<string>();
let guardInstalled = false;
function installGuard() {
  if (guardInstalled) return;
  guardInstalled = true;
  window.addEventListener("beforeunload", (e) => {
    if (dirtyCards.size) e.preventDefault();
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!dirtyCards.size) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      if (!confirm(LEAVE)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else dirtyCards.clear();
    },
    true,
  );
}

/**
 * A settings card: surface, 1px border, radius 12. Header (title 16/600 + description), body, and, when it
 * has an `action`, a footer with a hint on the left and a Save button on the right that only appears
 * once a field in this card changes. A card without an `action` is read-only content or holds its own forms.
 */
export function SettingsSection({
  title,
  description,
  children,
  id,
  action,
  section,
  fields,
  hint,
  flush = false,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
  /** Server action that saves this card's fields. Adds the dirty-tracked footer. */
  action?: (form: FormData) => Promise<SaveResult> | SaveResult;
  /** Sent as a hidden `section` field, so one server action can save each card on its own. */
  section?: string;
  /** More hidden fields to post with the card (an id, say). */
  fields?: Record<string, string>;
  /** Footer hint, shown on the left. */
  hint?: ReactNode;
  /** No body padding, for tables that run edge to edge. */
  flush?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const base = useRef("");
  const [dirty, setDirty] = useState(false);
  const path = usePathname();
  const key = useId();
  const save = useSaveState({ success: `${title} saved` });
  const snap = () => (ref.current ? JSON.stringify([...new FormData(ref.current)].map(([k, v]) => [k, typeof v === "string" ? v : v.name])) : "");
  const check = () => setDirty(snap() !== base.current);
  const rebase = () => {
    base.current = snap();
    setDirty(false);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    rebase();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!action) return;
    installGuard();
    if (dirty) dirtyCards.add(key);
    else dirtyCards.delete(key);
    return () => void dirtyCards.delete(key);
  }, [dirty, action, key]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!action) return;
    const data = new FormData(e.currentTarget);
    void save.run(async () => {
      const r = await action(data);
      if (!(r && typeof r === "object" && r.error)) rebase();
      return r;
    });
  };
  const cardId = id ?? `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const inner = (
    <>
      <div className="p-4">
        <h2 className="type-heading text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className={cx("min-w-0 border-t border-line", flush ? "overflow-hidden rounded-b-xl" : "space-y-4 p-4")}>{children}</div>
      {action ? (
        (dirty || save.status !== "idle") && (
          <div className="flex items-center justify-between gap-4 rounded-b-xl border-t border-line bg-app px-4 py-[10px]">
            {save.error ? (
              <span role="alert" className="text-13 text-danger">
                {save.error}
              </span>
            ) : (
              <span className="text-13 text-faint">{hint}</span>
            )}
            <SaveButton status={save.status} />
          </div>
        )
      ) : (
        hint && <div className="rounded-b-xl border-t border-line bg-app px-4 py-[10px] text-13 text-faint">{hint}</div>
      )}
    </>
  );
  const box = "scroll-mt-6 rounded-xl border border-line bg-surface";
  return action ? (
    <form id={cardId} data-settings-card data-title={title} ref={ref} onSubmit={submit} className={box} onInput={check} onChange={check} onReset={() => setTimeout(check, 0)}>
      {section && <input type="hidden" name="section" value={section} />}
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {inner}
    </form>
  ) : (
    <section id={cardId} data-settings-card data-title={title} className={box}>
      {inner}
    </section>
  );
}

/** Re-sync React state after the form is reset (reset restores DOM values on the next tick). */
function useResetSync(el: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, sync: () => void) {
  useEffect(() => {
    const form = el.current?.form;
    if (!form) return;
    const on = () => setTimeout(sync, 0);
    form.addEventListener("reset", on);
    return () => form.removeEventListener("reset", on);
  });
}

/**
 * Switch for enabling a feature. Submits like a checkbox (`on`). Dependent fields go in `children`:
 * they collapse when off but stay mounted, so their values still reach the server action.
 */
export function Toggle({
  name,
  label,
  description,
  defaultChecked = false,
  inline = false,
  children,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  /** Put the dependent fields on the same row, to the right of the label. */
  inline?: boolean;
  children?: ReactNode;
}) {
  const [on, setOn] = useState(defaultChecked);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useResetSync(input, () => setOn(Boolean(input.current?.checked)));
  return (
    <div data-search-field className={inline ? "flex flex-wrap items-center gap-x-4 gap-y-2" : undefined}>
      <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-3", inline && "w-40 shrink-0")}>
        <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
          <input
            ref={input}
            id={id}
            type="checkbox"
            role="switch"
            name={name}
            defaultChecked={defaultChecked}
            onChange={(e) => setOn(e.target.checked)}
            className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full"
          />
          <span aria-hidden className="absolute inset-0 rounded-full bg-fill-strong transition-colors duration-150 peer-checked:bg-accent" />
          <span aria-hidden className="absolute left-0.5 top-0.5 size-4 rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-150 peer-checked:translate-x-4" />
        </span>
        <span>
          <span className={cx("block text-sm text-ink", inline ? "font-medium" : "font-semibold")}>{label}</span>
          {description && <span className="block text-13 text-muted">{description}</span>}
        </span>
      </label>
      {children && inline && <div className={cx("flex items-center gap-2", !on && "hidden")}>{children}</div>}
      {children && !inline && (
        <div className={cx("grid transition-[grid-template-rows] duration-200", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!on}>
          <div className="overflow-hidden">
            <div className="mt-3 space-y-4 rounded-lg bg-fill p-4">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const preview = (text: string, business?: string) => text.replace(/\{name\}/g, "Priya").replace(/\{business\}/g, business || "your business");

/**
 * Message textarea (left): grows with its content, no resize handle, variable chips that insert at the
 * cursor and a character counter. A live WhatsApp-style preview sits to the right, with variables
 * resolved to sample values.
 */
export function MessageField({
  name,
  label,
  defaultValue = "",
  max = 1000,
  business,
  variables = ["name", "business"],
  bubble = true,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  max?: number;
  business?: string;
  variables?: string[];
  /** Show the WhatsApp bubble preview. Off for fields that aren't sent to customers as written. */
  bubble?: boolean;
  hint?: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const id = useId();
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useResetSync(ta, () => setValue(ta.current?.value ?? ""));
  const insert = (v: string) => {
    const el = ta.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.focus();
    el.setRangeText(`{${v}}`, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return (
    <div data-search-field className={cx("grid gap-4", bubble && "md:grid-cols-2")}>
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1.5 block text-13 font-medium text-ink">
          {label}
        </label>
        <textarea
          ref={ta}
          id={id}
          name={name}
          rows={3}
          maxLength={max}
          defaultValue={defaultValue}
          onInput={(e) => setValue(e.currentTarget.value)}
          className="block min-h-24 w-full resize-none overflow-hidden rounded-md border border-line-input bg-field px-3 py-2 text-sm leading-relaxed text-ink transition-surface"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {variables.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)} className="h-6 rounded border border-line bg-surface px-2 text-xs text-ink transition-surface hover:bg-fill-strong">
                {`{${v}}`}
              </button>
            ))}
            {hint && variables.length === 0 && <span className="text-13 text-muted">{hint}</span>}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-faint" aria-live="polite">
            {value.length} / {max}
          </span>
        </div>
        {hint && variables.length > 0 && <p className="mt-1 text-13 text-muted">{hint}</p>}
      </div>
      {bubble && (
        <div className="min-w-0" aria-hidden>
          <div className="mb-1.5 text-xs text-faint">Preview</div>
          <div className="min-h-24 rounded-lg bg-[var(--wf-wa-bg)] p-3">
            <div className="relative ml-auto w-fit max-w-[92%] rounded-lg rounded-tr-none bg-[var(--wf-wa-out)] px-2.5 py-1.5 text-13 shadow-[0_1px_1px_rgba(0,0,0,0.12)]">
              <span className="absolute -right-2 top-0 size-0 border-r-8 border-t-8 border-r-transparent border-t-[var(--wf-wa-out)]" />
              <p className="whitespace-pre-wrap break-words text-ink">{value.trim() ? preview(value, business) : <span className="text-muted">Your message</span>}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none text-muted">
                9:41
                <CheckCheck size={14} strokeWidth={1.75} className="text-[#53bdeb]" />
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Searchable time zone select. Submits the chosen IANA name under `name`. */
export function TimezoneSelect({ name, defaultValue, id }: { name: string; defaultValue: string; id?: string }) {
  const zones = useMemo(() => {
    let all: string[] = [];
    try {
      all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {}
    return all.includes(defaultValue) ? all : [defaultValue, ...all];
  }, [defaultValue]);
  const [value, setValue] = useState(defaultValue);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  useResetSync(hidden, () => setValue(defaultValue));
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, "_");
    return (t ? zones.filter((z) => z.toLowerCase().includes(t)) : zones).slice(0, 80);
  }, [q, zones]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const pick = (z: string) => {
    setValue(z);
    setOpen(false);
    setQ("");
    // a controlled hidden input emits no events: tell the form so it re-checks for changes
    requestAnimationFrame(() => hidden.current?.form?.dispatchEvent(new Event("input", { bubbles: true })));
  };
  return (
    <div ref={box} className="relative">
      <input ref={hidden} type="hidden" name={name} value={value} readOnly />
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id ?? name}-list`}
        onClick={() => {
          setOpen((o) => !o);
          setHi(0);
        }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line-input bg-field px-3 text-left text-sm text-ink transition-surface"
      >
        <span className="truncate">{value.replaceAll("_", " ")}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg bg-surface p-1 shadow-menu">
          <input
            data-bare
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (shown[hi]) pick(shown[hi]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Search time zones"
            aria-label="Search time zones"
            className="mb-1 h-9 w-full rounded-md border border-line-input bg-field px-3 text-sm outline-none"
          />
          <ul id={`${id ?? name}-list`} role="listbox" className="max-h-60 overflow-y-auto">
            {shown.length === 0 && <li className="px-2.5 py-2 text-13 text-muted">No match</li>}
            {shown.map((z, i) => (
              <li key={z} role="option" aria-selected={z === value}>
                <button
                  type="button"
                  onClick={() => pick(z)}
                  onMouseEnter={() => setHi(i)}
                  className={cx("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-13 text-ink", i === hi && "bg-fill")}
                >
                  <span className="flex-1 truncate">{z.replaceAll("_", " ")}</span>
                  {z === value && <Check size={14} strokeWidth={1.75} aria-hidden className="text-accent" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Short fields side by side; long ones go outside the grid, full width. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** "On this page": links to each settings card on the page, with the one in view marked by a green left bar. */
export function SettingsToc() {
  const path = usePathname();
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [active, setActive] = useState("");
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-settings-card]")];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(els.map((el) => ({ id: el.id, title: el.dataset.title ?? el.id })));
    setActive(els[0]?.id ?? "");
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        }
        const first = els.find((el) => seen.has(el.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [path]);
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="-mx-4 flex flex-col">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          onClick={() => setActive(i.id)}
          aria-current={active === i.id ? "location" : undefined}
          className={cx(
            "relative truncate px-4 py-1.5 text-13 transition-surface hover:text-ink before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full",
            active === i.id ? "font-medium text-ink before:bg-accent" : "text-muted before:bg-transparent",
          )}
        >
          {i.title}
        </a>
      ))}
    </nav>
  );
}
