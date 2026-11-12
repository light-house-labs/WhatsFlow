"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import {
  Bot,
  CalendarDays,
  FileText,
  KanbanSquare,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Package,
  Search,
  ShoppingBag,
  Ticket,
  UserPlus,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/db/schema";
import { logout } from "@/app/(auth)/actions";
import { createFlow } from "@/app/(app)/bots/actions";
import { createAutomation } from "@/app/(app)/automations/actions";
import {
  rankStatic,
  staticEntries,
  type ActionId,
  type StaticEntry,
} from "@/lib/search/registry";
import {
  ADMIN_TYPES,
  ENTITY_LABEL,
  fold,
  parsePrefix,
  phoneDigits,
  type EntityType,
  type SearchGroup,
  type SearchHit,
  type SearchResponse,
} from "@/lib/search/query";
import { SHORTCUTS } from "@/lib/shortcuts";
import { usePlatform } from "@/lib/platform";
import {
  Kbd,
  Tip,
  useShortcut,
  useShortcutMatcher,
} from "@/components/shortcuts";
import { useHelp } from "@/components/help-drawer";
import {
  focusTarget,
  targetHash,
  SearchTargetOnLoad,
} from "@/components/search-target";

const ENTITY_ICON: Record<EntityType, LucideIcon> = {
  contacts: Users,
  conversations: MessageSquare,
  leads: KanbanSquare,
  orders: ShoppingBag,
  tickets: Ticket,
  appointments: CalendarDays,
  products: Package,
  templates: FileText,
  bot_flows: Bot,
  campaigns: Megaphone,
  automations: Workflow,
  messages: MessageCircle,
};

const TYPE_TAG: Record<StaticEntry["type"], string> = {
  action: "Action",
  page: "Page",
  setting: "Setting",
};

const RECENT_KEY = "wf:search-recent";
const RECENT_MAX = 8;
const DEBOUNCE_MS = 150;

/** What "Recent" remembers: a registry id, or enough of a record to show and open it again. */
type Recent =
  | { kind: "static"; id: string }
  | {
      kind: "entity";
      type: EntityType;
      id: string;
      title: string;
      subtitle: string;
      href: string;
      tag?: string;
    };

type Item = {
  key: string;
  group: string;
  icon: LucideIcon;
  title: string;
  /** [start, end] inclusive ranges of `title` to bold. */
  ranges?: readonly (readonly [number, number])[];
  subtitle?: string;
  tag?: string;
  /** Registry or entity type; a group whose rows share one hides the per-row tag. */
  kind?: string;
  entry?: StaticEntry;
  href?: string;
  /** Changes the palette itself (e.g. narrows to messages) instead of opening something. */
  refine?: () => void;
  recent?: Recent;
};

const Ctx = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the palette from anywhere inside the app shell. */
export function useCommandPalette() {
  return useContext(Ctx);
}

/** Global search: mod+K anywhere, or "/" outside a text field. Wraps the app shell so the sidebar's search button can open it. */
export function CommandPaletteProvider({
  role,
  hasSandbox,
  children,
}: {
  role: Role;
  hasSandbox: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ctx = useMemo(() => ({ open: () => setOpen(true) }), []);
  useShortcut(SHORTCUTS.search, () => setOpen((o) => !o));
  useShortcut(SHORTCUTS.searchSlash, () => setOpen(true));
  return (
    <Ctx.Provider value={ctx}>
      {children}
      <SearchTargetOnLoad />
      {open && (
        <Palette
          role={role}
          hasSandbox={hasSandbox}
          onClose={() => setOpen(false)}
        />
      )}
    </Ctx.Provider>
  );
}

/** Input-style trigger at the top of the main and settings sidebars. */
export function SearchButton() {
  const { open } = useCommandPalette();
  const { isApple } = usePlatform();
  return (
    <Tip label="Search" keys={SHORTCUTS.search} className="flex w-full">
      <button
        type="button"
        onClick={open}
        aria-label="Search"
        aria-keyshortcuts={isApple ? "Meta+K" : "Control+K"}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-line-input bg-surface px-2.5 text-left text-13 text-faint shadow-xs transition-surface hover:border-line-strong hover:text-muted md:max-lg:justify-center md:max-lg:px-0"
      >
        <Search size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className="flex-1 truncate md:max-lg:hidden">Search...</span>
        <Kbd keys={SHORTCUTS.search} variant="plain" className="shrink-0 font-sans text-xs text-faint md:max-lg:hidden" />
      </button>
    </Tip>
  );
}

function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(r: Recent) {
  try {
    const key = (x: Recent) =>
      x.kind === "static" ? `s:${x.id}` : `e:${x.type}:${x.id}`;
    const next = [r, ...readRecent().filter((x) => key(x) !== key(r))].slice(
      0,
      RECENT_MAX,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

/** Bold ranges for an entity title: where the query (or each of its words) appears, ignoring case and accents. */
function rangesFor(title: string, q: string): [number, number][] {
  const t = fold(title);
  const out: [number, number][] = [];
  const whole = fold(q).trim();
  const terms =
    whole && t.includes(whole)
      ? [whole]
      : whole.split(/\s+/).filter((w) => w.length > 1);
  for (const w of terms) {
    const i = t.indexOf(w);
    if (i >= 0) out.push([i, i + w.length - 1]);
  }
  return out;
}

function Highlight({
  text,
  ranges,
}: {
  text: string;
  ranges?: Item["ranges"];
}) {
  if (!ranges?.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  [...ranges]
    .sort((a, b) => a[0] - b[0])
    .forEach(([s, e], i) => {
      if (s < at) return;
      if (s > at) parts.push(text.slice(at, s));
      parts.push(
        <b key={i} className="font-bold text-ink">
          {text.slice(s, e + 1)}
        </b>,
      );
      at = e + 1;
    });
  parts.push(text.slice(at));
  return <>{parts}</>;
}

type Entities = { key: string; groups: SearchGroup[] } | null;

function Palette({
  role,
  hasSandbox,
  onClose,
}: {
  role: Role;
  hasSandbox: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const help = useHelp();
  const [query, setQuery] = useState("");
  const [messagesOnly, setMessagesOnly] = useState(false);
  const [value, setValue] = useState("");
  const [entities, setEntities] = useState<Entities>(null);
  const [recent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const matches = useShortcutMatcher();
  const { isTouchOnly } = usePlatform();

  const entries = useMemo(
    () => staticEntries(role, hasSandbox),
    [role, hasSandbox],
  );
  const { mode, text } = parsePrefix(query);

  // Give focus back to whatever had it before the palette opened.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  // ---- entity search: debounced, previous request aborted ----
  const params = useMemo(() => {
    if (!text || (mode === "actions" && !messagesOnly)) return null;
    const p = new URLSearchParams({ q: text });
    if (messagesOnly) p.set("scope", "messages");
    else if (mode === "contacts") p.set("types", "contacts");
    else if (mode === "numbers") {
      p.set("types", "orders,tickets");
      p.set("numbers", "1");
    }
    return p.toString();
  }, [text, mode, messagesOnly]);

  useEffect(() => {
    if (!params) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?${params}`, { signal: ac.signal });
        const body = res.ok
          ? ((await res.json()) as SearchResponse)
          : { groups: [] };
        setEntities({ key: params, groups: body.groups });
      } catch {
        if (!ac.signal.aborted) setEntities({ key: params, groups: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [params]);

  const loading = params !== null && entities?.key !== params;
  const groups =
    params !== null && entities?.key === params ? entities.groups : [];

  // ---- running things ----
  const runAction = useCallback(
    (id: ActionId) => {
      if (id === "toggle-theme")
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      else if (id === "open-help") help.open();
      else if (id === "logout") startTransition(() => logout());
      else if (id === "create-flow") startTransition(() => createFlow());
      else if (id === "create-automation")
        startTransition(() => createAutomation());
    },
    [resolvedTheme, setTheme, help],
  );

  const openItem = (item: Item, newTab = false) => {
    if (item.recent) pushRecent(item.recent);
    const e = item.entry;
    const href = item.href ?? e?.path;
    if (e?.action) {
      onClose();
      runAction(e.action);
      return;
    }
    if (!href) return;
    const target =
      e && (e.anchor || e.field) ? { anchor: e.anchor, field: e.field } : null;
    if (newTab) {
      window.open(
        href + (target ? targetHash(target) : ""),
        "_blank",
        "noopener",
      );
      onClose();
      return;
    }
    onClose();
    router.push(href + (e?.anchor ? `#${e.anchor}` : ""));
    if (target) focusTarget({ path: href.split(/[?#]/)[0], ...target });
  };

  // ---- the list ----
  const fromEntry = (
    e: StaticEntry,
    group: string,
    ranges?: Item["ranges"],
  ): Item => ({
    key: `${group}:${e.id}`,
    group,
    icon: e.icon,
    title: e.title,
    ranges,
    subtitle: e.subtitle,
    tag: TYPE_TAG[e.type],
    kind: e.type,
    entry: e,
    recent: { kind: "static", id: e.id },
  });
  const fromHit = (
    type: EntityType,
    h: SearchHit,
    group: string,
    q: string,
  ): Item => ({
    key: `${group}:${type}:${h.id}`,
    group,
    icon: ENTITY_ICON[type],
    title: h.title,
    ranges: q ? rangesFor(h.title, q) : undefined,
    subtitle: h.subtitle,
    tag: h.tag ?? ENTITY_LABEL[type].replace(/s$/, ""),
    kind: type,
    href: h.href,
    recent: {
      kind: "entity",
      type,
      id: h.id,
      title: h.title,
      subtitle: h.subtitle,
      href: h.href,
      tag: h.tag,
    },
  });

  const sections: { label: string; items: Item[] }[] = [];
  if (!text && !messagesOnly) {
    if (mode === "all") {
      const byId = new Map(entries.map((e) => [e.id, e]));
      const rec = recent
        .map((r): Item | null => {
          if (r.kind === "static") {
            const e = byId.get(r.id);
            return e ? fromEntry(e, "Recent") : null;
          }
          if (role === "agent" && ADMIN_TYPES.includes(r.type)) return null;
          return fromHit(
            r.type,
            {
              id: r.id,
              title: r.title,
              subtitle: r.subtitle,
              href: r.href,
              tag: r.tag,
            },
            "Recent",
            "",
          );
        })
        .filter((x): x is Item => x !== null);
      if (rec.length) sections.push({ label: "Recent", items: rec });
      sections.push({
        label: "Quick actions",
        items: entries
          .filter((e) => e.quick)
          .map((e) => fromEntry(e, "Quick actions")),
      });
    } else if (mode === "actions") {
      sections.push({
        label: "Actions",
        items: entries
          .filter((e) => e.type === "action")
          .map((e) => fromEntry(e, "Actions")),
      });
    }
  } else if (text) {
    if (!messagesOnly && (mode === "all" || mode === "actions")) {
      const hits = rankStatic(
        mode === "actions"
          ? entries.filter((e) => e.type === "action")
          : entries,
        text,
      );
      const ranges = (h: (typeof hits)[number]) =>
        h.matches.find((m) => m.key === "title")?.indices;
      const actions = hits
        .filter((h) => h.entry.type === "action")
        .slice(0, mode === "actions" ? 20 : 5);
      const pages = hits.filter((h) => h.entry.type !== "action").slice(0, 8);
      if (actions.length)
        sections.push({
          label: "Actions",
          items: actions.map((h) => fromEntry(h.entry, "Actions", ranges(h))),
        });
      if (pages.length)
        sections.push({
          label: "Pages and settings",
          items: pages.map((h) =>
            fromEntry(h.entry, "Pages and settings", ranges(h)),
          ),
        });
    }
    for (const g of groups) {
      const label = ENTITY_LABEL[g.type];
      sections.push({
        label,
        items: g.items.map((h) => fromHit(g.type, h, label, text)),
      });
    }
  }

  const noResults =
    Boolean(text) && !loading && sections.every((s) => !s.items.length);
  if (noResults && !messagesOnly && mode !== "actions") {
    const phone = phoneDigits(text);
    sections.push({
      label: "Suggestions",
      items: [
        {
          key: "suggest:contact",
          group: "Suggestions",
          icon: UserPlus,
          title: phone
            ? `Create contact with number '${text}'`
            : `Create contact named '${text}'`,
          href: `/contacts?new=1&${phone ? "phone" : "name"}=${encodeURIComponent(text)}`,
        },
        {
          key: "suggest:messages",
          group: "Suggestions",
          icon: MessageCircle,
          title: `Search messages for '${text}'`,
          subtitle: "Every message, not just the last 90 days",
          refine: () => {
            setMessagesOnly(true);
            setQuery(text);
          },
        },
      ],
    });
  }

  const flat = sections.flatMap((s) => s.items);
  const select = (item: Item, newTab = false) => {
    if (item.refine) {
      item.refine();
      input.current?.focus();
    } else openItem(item, newTab);
  };

  // Keep a valid row selected as results change.
  const firstKey = flat[0]?.key ?? "";
  const valid = flat.some((i) => i.key === value);
  useEffect(() => {
    if (!valid) setValue(firstKey); // eslint-disable-line react-hooks/set-state-in-effect
  }, [valid, firstKey]);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [query, messagesOnly]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (matches(e, SHORTCUTS.close)) {
      e.preventDefault();
      onClose();
    } else if (matches(e, SHORTCUTS.openInNewTab)) {
      e.preventDefault();
      const item = flat.find((i) => i.key === value);
      if (item) select(item, true);
    } else if (matches(e, "tab") || matches(e, "shift+tab")) {
      e.preventDefault();
      const labels = sections.filter((s) => s.items.length).map((s) => s.label);
      if (labels.length < 2) return;
      const cur = flat.find((i) => i.key === value)?.group ?? labels[0];
      const next =
        labels[
          (labels.indexOf(cur) + (e.shiftKey ? -1 : 1) + labels.length) %
            labels.length
        ];
      const first = sections.find((s) => s.label === next)?.items[0];
      if (first) {
        setValue(first.key);
        requestAnimationFrame(() =>
          list.current
            ?.querySelector(`[data-value="${CSS.escape(first.key)}"]`)
            ?.scrollIntoView({ block: "nearest" }),
        );
      }
    } else if (matches(e, "backspace") && messagesOnly && !query) {
      setMessagesOnly(false);
    }
  };

  const showSkeleton = loading && !groups.length;

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
        aria-label="Search"
        // Phone: a full-screen sheet with the field under the status bar and a Cancel button.
        className="absolute left-1/2 top-[15vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.06)] max-md:inset-0 max-md:top-0 max-md:left-0 max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)] max-md:shadow-none"
      >
        <Command
          className="max-md:flex max-md:h-full max-md:flex-col"
          label="Search"
          shouldFilter={false}
          loop
          vimBindings={false}
          value={value}
          onValueChange={setValue}
          onKeyDown={onKeyDown}
        >
          <div className="flex h-12 items-center gap-2.5 border-b border-line px-4 max-md:h-14 max-md:shrink-0">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className="shrink-0 text-faint"
            />
            {messagesOnly && (
              <span className="flex h-6 shrink-0 items-center gap-1 rounded bg-fill pl-2 pr-1 text-xs font-medium text-ink">
                Messages
                <button
                  type="button"
                  aria-label="Search everything"
                  onClick={() => setMessagesOnly(false)}
                  className="grid size-4 place-items-center rounded text-faint hover:text-ink"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            )}
            <Command.Input
              ref={input}
              data-bare
              autoFocus
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              value={query}
              onValueChange={setQuery}
              placeholder={
                messagesOnly
                  ? "Search every message"
                  : "Search or type > for actions, @ for contacts, # for numbers"
              }
              className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink shadow-none outline-none ring-0 placeholder:text-placeholder"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
                className="grid size-6 shrink-0 place-items-center rounded text-faint transition-surface hover:bg-fill hover:text-ink"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
            <button type="button" onClick={onClose} className="tap -mr-1 h-11 shrink-0 px-1 text-base text-accent-text md:hidden">
              Cancel
            </button>
          </div>
          <Command.List
            ref={list}
            className="max-h-[min(60vh,calc(85vh-96px))] overflow-y-auto overscroll-contain p-2 max-md:max-h-none max-md:min-h-0 max-md:flex-1 max-md:pb-[env(safe-area-inset-bottom)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:leading-4 [&_[cmdk-group-heading]]:text-faint"
          >
            {!text &&
              !messagesOnly &&
              (mode === "contacts" || mode === "numbers") && (
                <div className="px-2 pb-1 pt-3 text-sm text-muted">
                  {mode === "contacts"
                    ? "Type a name, number or email."
                    : "Type an order or ticket number."}
                </div>
              )}
            {noResults && (
              <div className="px-2 pb-1 pt-3 text-sm text-muted">
                {messagesOnly
                  ? `No messages match '${text}'`
                  : mode === "actions"
                    ? `No actions match '${text}'`
                    : `No results for '${text}'`}
              </div>
            )}
            {sections.map(
              (s) =>
                s.items.length > 0 && (
                  <Command.Group key={s.label} heading={s.label}>
                    {s.items.map((item) => (
                      <Row
                        key={item.key}
                        item={item}
                        showTag={mixed(s)}
                        selected={item.key === value}
                        onSelect={() => select(item)}
                      />
                    ))}
                  </Command.Group>
                ),
            )}
            {showSkeleton && (
              <Command.Loading label="Searching records">
                <div className="px-2 pb-1 pt-2 text-[12px] font-semibold leading-4 text-faint">
                  {messagesOnly ? "Messages" : "Records"}
                </div>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-2 py-2"
                    aria-hidden
                  >
                    <span className="size-4 shrink-0 animate-pulse rounded bg-fill" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3 w-2/5 animate-pulse rounded bg-fill" />
                      <span className="block h-2.5 w-3/5 animate-pulse rounded bg-fill" />
                    </span>
                  </div>
                ))}
              </Command.Loading>
            )}
          </Command.List>
          {!isTouchOnly && (
            <div
              className="flex h-10 items-center gap-4 border-t border-line bg-fill px-4 text-xs font-medium text-muted"
              aria-hidden
            >
              <Hint keys={SHORTCUTS.navigate}>navigate</Hint>
              <Hint keys={[SHORTCUTS.open]}>open</Hint>
              <Hint keys={[SHORTCUTS.openInNewTab]} className="hidden sm:flex">
                new tab
              </Hint>
              <Hint keys={[SHORTCUTS.close]}>close</Hint>
            </div>
          )}
        </Command>
      </div>
    </div>,
    document.body,
  );
}

function Hint({
  keys,
  className = "flex",
  children,
}: {
  keys: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${className} items-center gap-1`}>
      {keys.map((k) => (
        <Kbd key={k} keys={k} />
      ))}
      <span className="ml-0.5">{children}</span>
    </span>
  );
}

/** Type tags only help where a group mixes types: Recent, or search results spanning pages and settings. */
const mixed = (s: { label: string; items: Item[] }) =>
  s.label === "Recent" || new Set(s.items.map((i) => i.kind)).size > 1;

function Row({
  item,
  showTag,
  selected,
  onSelect,
}: {
  item: Item;
  showTag: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <Command.Item
      value={item.key}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-ink outline-none transition-[background-color] duration-[80ms] data-[selected=true]:bg-fill"
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        aria-hidden
        className="shrink-0 text-faint"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          <Highlight text={item.title} ranges={item.ranges} />
        </span>
        {item.subtitle && (
          <span className="block truncate text-13 text-faint">
            {item.subtitle}
          </span>
        )}
      </span>
      {showTag && item.tag && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs text-faint ${selected ? "bg-surface" : "bg-fill"}`}
        >
          {item.tag}
        </span>
      )}
      {selected && (
        <Kbd
          keys={SHORTCUTS.open}
          variant="plain"
          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-xs bg-surface px-1 font-sans text-xs text-faint"
        />
      )}
    </Command.Item>
  );
}
