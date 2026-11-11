"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cx } from "@/components/ui";

export type ComboOption = { value: string; count?: number };

/**
 * Searchable multi-select with chips, following the ARIA 1.2 combobox pattern (editable combobox with a
 * listbox popup). Type to filter, ↑/↓ to move, Enter to pick or create, Esc to close, Backspace on an
 * empty box to remove the last chip. With `allowCreate`, a typed value that matches nothing is offered
 * as `Create "x"`.
 */
export function Combobox({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
  allowCreate = false,
  normalize = (s) => s.trim(),
  maxLength = 40,
  max,
  emptyText = "No matches",
  className,
}: {
  id?: string;
  /** Accessible name for the field. */
  label: string;
  options: ComboOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowCreate?: boolean;
  /** Applied to typed text before matching or creating (trim, lowercase…). */
  normalize?: (s: string) => string;
  maxLength?: number;
  max?: number;
  emptyText?: string;
  className?: string;
}) {
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [note, setNote] = useState("");

  const q = normalize(query);
  const atMax = max != null && value.length >= max;
  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    const known = new Map(options.map((o) => [o.value.toLowerCase(), o]));
    // chips that aren't in the option list (just created, or since deleted) still show as selected
    const all: ComboOption[] = [...options, ...value.filter((v) => !known.has(v.toLowerCase())).map((v) => ({ value: v }))];
    const matches = all
      .filter((o) => !needle || o.value.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.value.toLowerCase().startsWith(needle)) - Number(a.value.toLowerCase().startsWith(needle)) || (b.count ?? 0) - (a.count ?? 0) || a.value.localeCompare(b.value))
      .slice(0, 50);
    const exists = all.some((o) => o.value.toLowerCase() === needle);
    const create = allowCreate && q && !exists && !atMax ? q : null;
    return { matches, create };
  }, [options, value, q, allowCreate, atMax]);
  const total = rows.matches.length + (rows.create ? 1 : 0);
  const active = Math.min(hi, Math.max(total - 1, 0));

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const has = (v: string) => value.some((x) => x.toLowerCase() === v.toLowerCase());
  const toggle = (v: string) => {
    if (has(v)) {
      onChange(value.filter((x) => x.toLowerCase() !== v.toLowerCase()));
      setNote(`${v} removed`);
    } else if (!atMax) {
      onChange([...value, v]);
      setNote(`${v} added`);
    }
    setQuery("");
    setHi(0);
  };
  const create = (v: string) => {
    onChange([...value, v.slice(0, maxLength)]);
    setNote(`${v} created and added`);
    setQuery("");
    setHi(0);
  };
  const pick = (i: number) => {
    if (i < rows.matches.length) toggle(rows.matches[i].value);
    else if (rows.create) create(rows.create);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else setHi((active + 1) % Math.max(total, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else setHi((active - 1 + Math.max(total, 1)) % Math.max(total, 1));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setHi(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setHi(Math.max(total - 1, 0));
        }
        break;
      case "Enter":
        // never submit the surrounding form from here
        e.preventDefault();
        if (open && total > 0) pick(active);
        else setOpen(true);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        } else if (query) {
          e.preventDefault();
          setQuery("");
        }
        break;
      case "Backspace":
        if (!query && value.length) {
          onChange(value.slice(0, -1));
          setNote(`${value[value.length - 1]} removed`);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={box} className={cx("relative", className)}>
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-line-input bg-field px-1.5 py-1 focus-within:outline-2 focus-within:outline-accent"
        onClick={() => input.current?.focus()}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-xs bg-accent-soft py-0.5 pl-2 pr-1 text-13 text-accent-text">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(v);
                input.current?.focus();
              }}
              className="grid size-4 place-items-center rounded-xs hover:bg-fill-strong"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={inputId}
          data-bare
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={open && total > 0 ? optId(active) : undefined}
          autoComplete="off"
          value={query}
          maxLength={maxLength}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1 text-sm text-ink outline-none"
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} aria-multiselectable="true" className="absolute z-20 mt-1 max-h-60 w-full min-w-56 overflow-y-auto rounded-lg bg-surface p-1 shadow-menu">
          {total === 0 && (
            <li role="presentation" className="px-2.5 py-2 text-13 text-muted">
              {atMax ? `You can pick up to ${max}.` : emptyText}
            </li>
          )}
          {rows.matches.map((o, i) => {
            const on = has(o.value);
            return (
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                aria-selected={on}
                // keep focus in the input so the list stays open
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                onMouseEnter={() => setHi(i)}
                className={cx("flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-13 text-ink", i === active && "bg-fill")}
              >
                <span className="flex-1 truncate">{o.value}</span>
                {o.count != null && <span className="tabular-nums text-muted">{o.count}</span>}
                {on && <Check size={14} strokeWidth={1.75} aria-hidden className="text-accent" />}
              </li>
            );
          })}
          {rows.create && (
            <li
              id={optId(rows.matches.length)}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(rows.matches.length)}
              onMouseEnter={() => setHi(rows.matches.length)}
              className={cx("flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-13 text-ink", rows.matches.length === active && "bg-fill")}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden className="text-accent" />
              <span className="truncate">Create “{rows.create}”</span>
            </li>
          )}
        </ul>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {note}
        {open ? `${note ? ". " : ""}${total} ${total === 1 ? "option" : "options"} available` : ""}
      </span>
    </div>
  );
}
