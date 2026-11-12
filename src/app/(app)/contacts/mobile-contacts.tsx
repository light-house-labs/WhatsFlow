"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { GroupEmpty, StickyActions } from "@/components/mobile/grouped";
import { Avatar, Field, Input, cx } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { formatWaId } from "@/lib/phone";
import { createContact } from "./actions";

export type MobileContact = { id: string; name: string | null; waId: string; tags: string[]; optedOut: boolean };

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
const letterOf = (c: MobileContact) => {
  const ch = (c.name ?? "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
};

/** Phone contacts: search on top, A–Z sections, and a scrubber on the right edge to jump between letters. */
export function MobileContacts({ contacts, total, q }: { contacts: MobileContact[]; total: number; q: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(q);
  const [active, setActive] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Search runs on the server (all contacts, not just the loaded page) after a short pause.
  useEffect(() => {
    if (value === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      router.replace(`${path}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [value, q, params, path, router]);

  const sections = useMemo(() => {
    const m = new Map<string, MobileContact[]>();
    for (const c of contacts) {
      const l = letterOf(c);
      m.set(l, [...(m.get(l) ?? []), c]);
    }
    return LETTERS.filter((l) => m.has(l)).map((l) => [l, m.get(l)!] as const);
  }, [contacts]);
  const present = new Set(sections.map(([l]) => l));

  const jump = (clientY: number, rail: HTMLElement) => {
    const r = rail.getBoundingClientRect();
    const i = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * LETTERS.length)));
    // Nearest letter that has contacts, looking forward first.
    const target = LETTERS.slice(i).find((l) => present.has(l)) ?? [...LETTERS.slice(0, i)].reverse().find((l) => present.has(l));
    if (!target || target === active) return;
    setActive(target);
    haptic("tap");
    list.current?.querySelector(`[data-letter="${target}"]`)?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="relative min-h-full bg-app">
      <div className="sticky top-0 z-10 bg-app px-4 pt-3 pb-2">
        <input
          data-bare
          type="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          aria-label="Search contacts"
          placeholder={`Search ${total} contacts`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 w-full rounded-[10px] bg-fill-strong px-3 text-ink outline-none placeholder:text-placeholder"
        />
      </div>
      {contacts.length === 0 ? (
        <div className="px-4 pt-2">
          <GroupEmpty
            icon={<Users />}
            title={q ? "No matches" : "No contacts yet"}
            description={q ? "Try a different name or number." : "People appear here as soon as they message your number."}
            action={
              !q && (
                <Link href="/contacts?new=1" className="tap press inline-flex h-11 items-center rounded-lg bg-accent px-5 text-base font-medium text-on-accent">
                  Add contact
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div ref={list} className="pr-6 pb-8">
          {sections.map(([letter, items]) => (
            <section key={letter} data-letter={letter} className="scroll-mt-[60px]">
              <h2 className="sticky top-[60px] z-[5] bg-app px-4 py-1 text-13 font-semibold text-faint">{letter}</h2>
              <ul className="mx-4 overflow-hidden rounded-xl bg-surface">
                {items.map((c) => (
                  <li key={c.id} className="group/row">
                    <Link href={`/contacts/${c.id}`} className="tap flex min-h-14 items-center gap-3 pl-3 active:bg-fill">
                      <Avatar name={c.name ?? c.waId} size={36} />
                      <span className="flex min-h-14 min-w-0 flex-1 items-center border-b border-line pr-3 group-last/row:border-0">
                        <span className="min-w-0 flex-1">
                          <span className="row-title block truncate">{c.name ?? formatWaId(c.waId)}</span>
                          <span className="row-meta block truncate">
                            {c.name ? formatWaId(c.waId) : "No name"}
                            {c.tags.length > 0 && ` · ${c.tags.join(", ")}`}
                            {c.optedOut && " · opted out"}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {contacts.length < total && !q && <p className="px-4 pt-4 text-center text-13 text-faint">Showing {contacts.length} of {total}. Search to find anyone else.</p>}
        </div>
      )}
      {sections.length > 3 && (
        <div
          role="slider"
          aria-label="Jump to letter"
          aria-valuenow={active ? LETTERS.indexOf(active) : 0}
          aria-valuetext={active ?? undefined}
          aria-valuemin={0}
          aria-valuemax={LETTERS.length - 1}
          tabIndex={-1}
          className="fixed top-1/2 right-0.5 z-20 flex -translate-y-1/2 touch-none flex-col items-center py-1 select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            jump(e.clientY, e.currentTarget);
          }}
          onPointerMove={(e) => e.buttons && jump(e.clientY, e.currentTarget)}
          onPointerUp={() => setActive(null)}
          onPointerCancel={() => setActive(null)}
        >
          {LETTERS.map((l) => (
            <span key={l} className={cx("grid h-[15px] w-5 place-items-center text-[11px] leading-none font-semibold", present.has(l) ? "text-accent-text" : "text-placeholder")}>
              {l}
            </span>
          ))}
        </div>
      )}
      {active && (
        <div aria-hidden className="pointer-events-none fixed top-1/2 left-1/2 z-30 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-ink/80 text-3xl font-semibold text-surface">
          {active}
        </div>
      )}
    </div>
  );
}

/** Full-screen "New contact" with the save bar pinned to the bottom. createContact opens the new contact on success. */
export function MobileNewContact({ name, phone }: { name?: string; phone?: string }) {
  return (
    <SaveForm action={createContact} success="Contact added" className="flex min-h-full flex-col bg-app px-4 pt-4">
      <div className="flex-1 space-y-4 rounded-xl bg-surface p-4">
        <Field label="Name" htmlFor="m-name">
          <Input id="m-name" name="name" defaultValue={name} autoComplete="name" autoCapitalize="words" enterKeyHint="next" className="h-11" />
        </Field>
        <Field label="Phone with country code" htmlFor="m-phone">
          <Input id="m-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={phone} required enterKeyHint="next" placeholder="+91 98765 43210" className="h-11" />
        </Field>
        <Field label="Tags" htmlFor="m-tags" hint="Comma separated">
          <Input id="m-tags" name="tags" autoCapitalize="none" enterKeyHint="done" className="h-11" />
        </Field>
      </div>
      <StickyActions>
        <SubmitButton savedLabel="Added">Add contact</SubmitButton>
      </StickyActions>
    </SaveForm>
  );
}
