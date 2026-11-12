"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, CalendarPlus, ChevronLeft, Plus, Search, ShoppingBag, Ticket, TrendingUp, UserPlus, WifiOff } from "lucide-react";
import { ActionSheet, BottomSheet } from "@/components/bottom-sheet";
import { useCommandPalette } from "@/components/command-palette";
import { useToast } from "@/components/toast";
import { Avatar, Button, cx } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { setNavDirection } from "@/lib/nav-direction";
import { formatWaId } from "@/lib/phone";
import { sendReply } from "@/app/(app)/inbox/actions";
import { enablePush, flushOutbox, pushSupported, useOnline, useOutbox, useServiceWorker } from "./pwa";
import { SALES, TABS, modeFor, parentOf, rootTitle, tabFor, type Mode } from "./routes";

/** Fired by the mobile inbox with the number of chats that have unread messages, so the tab badge stays live. */
export const UNREAD_EVENT = "wf:unread";

const COLLAPSE_AT = 32;
const EXPAND_AT = 8;
let inAppDepth = 0;

/** Back: pop in-app history when there is some, otherwise go to the screen's parent (e.g. opened from a push). */
export function useGoBack() {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  return useCallback(() => {
    setNavDirection("pop");
    haptic("tap");
    if (inAppDepth > 0) router.back();
    else {
      inAppDepth = -1; // a replace doesn't add history; the route-change effect brings this back to 0
      router.replace(parentOf(path, search));
    }
  }, [router, path, search]);
}

/**
 * Phone chrome around the app below 768px: a header with a large title that collapses on scroll, a bottom
 * tab bar, the "+" action sheet, the offline banner and push opt-in. Rendered next to the desktop sidebar and
 * hidden with md:hidden, so desktop and tablet are untouched.
 */
export function MobileChrome({
  position,
  unread: initialUnread,
  userId,
  vapidKey,
  children,
}: {
  position: "top" | "bottom";
  unread: number;
  userId: string;
  vapidKey: string | null;
  children?: ReactNode;
}) {
  const path = usePathname();
  const search = useSearchParams();
  const mode = modeFor(path, search);
  if (position === "bottom") return mode === "root" || mode === "push" ? <TabBar initialUnread={initialUnread} /> : null;
  return (
    <Top mode={mode} userId={userId} vapidKey={vapidKey}>
      {children}
    </Top>
  );
}

function Top({ mode, userId, vapidKey, children }: { mode: Mode; userId: string; vapidKey: string | null; children?: ReactNode }) {
  const path = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const palette = useCommandPalette();
  const goBack = useGoBack();
  const header = useRef<HTMLElement>(null);
  // Keyed by path, so a new screen always starts expanded.
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);
  const collapsed = collapsedFor === path;
  const [plus, setPlus] = useState(false);
  const [pick, setPick] = useState<"lead" | "ticket" | null>(null);
  const [title, setTitle] = useState("");
  const queued = useOutbox();

  // Pushed screens take their compact title from the page's <title>, minus the suffix.
  useEffect(() => {
    const read = () => setTitle(document.title.replace(/\s*·\s*WhatsFlow$/, ""));
    read();
    const el = document.querySelector("title");
    if (!el) return;
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [path]);

  // Collapse the large title on whichever scroller below the header moves (scroll doesn't bubble, so listen in capture).
  useEffect(() => {
    const main = header.current?.closest("main");
    if (!main) return;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!(t instanceof HTMLElement) || t.scrollHeight - t.clientHeight < 80) return;
      setCollapsedFor((prev) => ((prev === path ? t.scrollTop > EXPAND_AT : t.scrollTop > COLLAPSE_AT) ? path : null));
    };
    main.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => main.removeEventListener("scroll", onScroll, { capture: true });
  }, [path]);

  // Direction for the page slide: links in content push, the browser back button pops, tabs don't slide.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== location.origin) return;
      setNavDirection((a.dataset.nav as "push" | "pop" | "none") ?? "push");
    };
    const onPop = () => {
      setNavDirection("pop");
      inAppDepth = Math.max(0, inAppDepth - 2); // the route-change effect below adds one back
    };
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  const first = useRef(true);
  const key = path + "?" + search.toString();
  useEffect(() => {
    if (first.current) first.current = false;
    else inAppDepth++;
    const t = setTimeout(() => setNavDirection("none"), 450);
    return () => clearTimeout(t);
  }, [key]);

  // Edge swipe back. Only when installed: in a browser tab the browser's own edge gesture already does this.
  useEffect(() => {
    if (mode === "root") return;
    if (!matchMedia("(display-mode: standalone)").matches) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t.clientX < 24 ? { x: t.clientX, y: t.clientY } : null;
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx > 80 && dy < dx * 0.6) goBack();
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
    };
  }, [mode, goBack]);

  useServiceWorker(useCallback((url: string) => router.push(url), [router]));

  // Retry queue: send what was written offline as soon as the connection is back.
  useEffect(() => {
    if (!online || !queued.length) return;
    void flushOutbox(sendReply, (err) => toast.error(err));
    const t = setInterval(() => void flushOutbox(sendReply, (err) => toast.error(err)), 15000);
    return () => clearInterval(t);
  }, [online, queued.length, toast]);

  const plusActions = [
    { label: "New contact", icon: <UserPlus />, onSelect: () => router.push("/contacts?new=1") },
    { label: "New lead", description: "From a conversation", icon: <TrendingUp />, onSelect: () => setPick("lead") },
    { label: "New order", icon: <ShoppingBag />, onSelect: () => router.push("/orders/new") },
    { label: "New booking", icon: <CalendarPlus />, onSelect: () => router.push("/appointments?new=1") },
    { label: "New ticket", description: "From a conversation", icon: <Ticket />, onSelect: () => setPick("ticket") },
  ];

  const offline = !online && (
    <div role="status" className="flex items-center gap-2 bg-warning-soft px-4 py-2 text-13 text-warning">
      <WifiOff size={14} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        You&apos;re offline. Showing the last copy{queued.length ? `; ${queued.length} message${queued.length === 1 ? "" : "s"} will send when you're back` : ""}.
      </span>
    </div>
  );

  const sheets = (
    <>
      {plus && <ActionSheet title="Create" actions={plusActions} onClose={() => setPlus(false)} />}
      {pick && <ConversationPicker kind={pick} onClose={() => setPick(null)} />}
      <PushOptIn userId={userId} vapidKey={vapidKey} />
    </>
  );

  if (mode === "full")
    return (
      <div className="md:hidden">
        {offline && <div className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-40">{offline}</div>}
        {sheets}
      </div>
    );

  const iconBtn = "tap grid size-11 place-items-center rounded-full text-ink active:bg-fill";
  return (
    <header ref={header} className="shrink-0 border-b border-line bg-surface pt-[env(safe-area-inset-top)] md:hidden" style={{ viewTransitionName: "wf-mobile-header" }}>
      {mode === "root" ? (
        <>
          <div className="flex h-11 items-center gap-1 pr-2 pl-4">
            <span aria-hidden={!collapsed} className={cx("min-w-0 flex-1 truncate text-center text-base font-semibold transition-opacity duration-150", collapsed ? "opacity-100" : "opacity-0")}>
              {rootTitle(path)}
            </span>
            <button type="button" aria-label="Search" onClick={palette.open} className={iconBtn}>
              <Search size={20} strokeWidth={1.75} />
            </button>
            <button type="button" aria-label="Create" aria-haspopup="dialog" onClick={() => (haptic("tap"), setPlus(true))} className={iconBtn}>
              <Plus size={22} strokeWidth={1.75} />
            </button>
          </div>
          <div className={cx("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
            <div className="min-h-0 overflow-hidden">
              <h1 className="px-4 pt-0.5 pb-2 text-[30px] leading-9 font-bold tracking-[-0.02em]">{rootTitle(path)}</h1>
            </div>
          </div>
          {tabFor(path) === "sales" && <SalesSegments path={path} />}
        </>
      ) : (
        <div className="relative flex h-11 items-center px-1">
          <button type="button" onClick={goBack} className="tap z-10 flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-accent-text active:opacity-60">
            <ChevronLeft size={24} strokeWidth={2} aria-hidden />
            <span className="text-base">{mode === "form" ? "Cancel" : "Back"}</span>
          </button>
          <h1 className="pointer-events-none absolute inset-x-24 truncate text-center text-base font-semibold">{title}</h1>
          <div className="ml-auto flex items-center">
            {mode === "push" && (
              <button type="button" aria-label="Search" onClick={palette.open} className={iconBtn}>
                <Search size={20} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}
      {children}
      {offline}
      {sheets}
    </header>
  );
}

/** iOS-style segmented control for the four Sales routes. Switching segments doesn't slide. */
function SalesSegments({ path }: { path: string }) {
  return (
    <nav aria-label="Sales" className="px-4 pb-3">
      <div className="grid grid-cols-4 gap-0.5 rounded-[9px] bg-fill p-0.5">
        {SALES.map((s) => {
          const on = path === s.href || path.startsWith(s.href + "/");
          return (
            <Link
              key={s.href}
              href={s.href}
              data-nav="none"
              replace
              aria-current={on ? "page" : undefined}
              onClick={() => {
                haptic("tap");
                inAppDepth -= 1; // replace: no new history entry
              }}
              className={cx("tap grid h-8 place-items-center rounded-[7px] text-13 font-medium", on ? "bg-surface text-ink shadow-xs" : "text-muted active:text-ink")}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TabBar({ initialUnread }: { initialUnread: number }) {
  const path = usePathname();
  const active = tabFor(path);
  const [unread, setUnread] = useState(initialUnread);
  // A fresh server count (after a navigation) replaces whatever the inbox last reported.
  const [base, setBase] = useState(initialUnread);
  if (base !== initialUnread) {
    setBase(initialUnread);
    setUnread(initialUnread);
  }
  useEffect(() => {
    const on = (e: Event) => setUnread((e as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, on);
    return () => window.removeEventListener(UNREAD_EVENT, on);
  }, []);
  // Sales reopens on the segment you were last on.
  const [salesHref, setSalesHref] = useState("/pipeline");
  const segment = SALES.find((x) => path === x.href || path.startsWith(x.href + "/"));
  if (segment && segment.href !== salesHref) setSalesHref(segment.href);
  return (
    <nav aria-label="Main" className="shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" style={{ viewTransitionName: "wf-tabbar" }}>
      <ul className="grid h-14 grid-cols-4">
        {TABS.map(({ id, href, label, icon: Icon }) => {
          const on = active === id;
          return (
            <li key={id}>
              <Link
                href={id === "sales" ? salesHref : href}
                data-nav="none"
                aria-current={on ? "page" : undefined}
                onClick={() => haptic("tap")}
                className={cx("tap flex h-full flex-col items-center justify-center gap-0.5 active:opacity-60", on ? "text-accent" : "text-faint")}
              >
                <span className="relative">
                  <Icon size={24} strokeWidth={on ? 2 : 1.75} aria-hidden />
                  {id === "inbox" && unread > 0 && (
                    <span className="count-badge absolute -top-1.5 left-3.5 ring-2 ring-surface" aria-label={`${unread} unread`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className={cx("text-[11px] leading-[13px] font-medium", on ? "text-accent-text" : "text-faint")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type PickRow = { id: string; contactName: string | null; contactWaId: string; preview: string | null };

/** Leads and tickets start from a chat: pick one, and the chat opens with that section of the contact sheet. */
function ConversationPicker({ kind, onClose }: { kind: "lead" | "ticket"; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<PickRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetch(`/api/inbox/conversations?filter=open&q=${encodeURIComponent(q)}`, { signal: ctl.signal }).catch(() => null);
      if (r?.ok) setRows((await r.json()).conversations);
      else setRows((x) => x ?? []);
    }, 150);
    return () => (clearTimeout(t), ctl.abort());
  }, [q]);
  return (
    <BottomSheet title={kind === "lead" ? "New lead from…" : "New ticket from…"} onClose={onClose} snaps={[0.6, 0.92]}>
      <div className="px-4 pb-2">
        <input
          data-bare
          type="search"
          enterKeyHint="search"
          aria-label="Search conversations"
          placeholder="Search name or number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-10 w-full rounded-[10px] bg-fill px-3 text-ink outline-none placeholder:text-placeholder"
        />
      </div>
      <ul>
        {rows === null &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex h-16 items-center gap-3 px-4">
              <div className="size-10 animate-pulse rounded-full bg-fill" />
              <div className="h-4 flex-1 animate-pulse rounded bg-fill" />
            </li>
          ))}
        {rows?.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">No open conversations{q ? " match" : ""}.</li>}
        {rows?.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                onClose();
                setNavDirection("push");
                router.push(`/inbox?c=${c.id}&panel=${kind}`);
              }}
              className="tap flex min-h-16 w-full items-center gap-3 px-4 text-left active:bg-fill"
            >
              <Avatar name={c.contactName ?? c.contactWaId} size={40} />
              <span className="min-w-0 flex-1 border-b border-line py-3">
                <span className="row-title block truncate">{c.contactName ?? formatWaId(c.contactWaId)}</span>
                <span className="row-meta block truncate">{c.preview}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

/** Asked once per person per device, a moment after their first visit, and only where push can work. */
function PushOptIn({ userId, vapidKey }: { userId: string; vapidKey: string | null }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const flag = `wf:push-asked:${userId}`;
  useEffect(() => {
    if (!vapidKey || !pushSupported() || Notification.permission !== "default") return;
    if (!matchMedia("(max-width: 767.98px)").matches) return;
    try {
      if (localStorage.getItem(flag)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [flag, vapidKey]);
  if (!show || !vapidKey) return null;
  const done = () => {
    try {
      localStorage.setItem(flag, String(Date.now()));
    } catch {}
    setShow(false);
  };
  return (
    <BottomSheet
      title="Get notified"
      hideTitle
      onClose={done}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            className="h-12 w-full text-base"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const err = await enablePush(vapidKey);
              setBusy(false);
              if (err) toast.error(err);
              else toast.success("Notifications on for this device");
              done();
            }}
          >
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
          <Button variant="ghost" className="h-12 w-full text-base" onClick={done}>
            Not now
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center px-6 pt-2 pb-4 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent-text">
          <BellRing size={26} strokeWidth={1.75} aria-hidden />
        </div>
        <h2 className="text-xl font-semibold">Never miss a customer</h2>
        <p className="mt-2 text-base text-muted">Get a notification when a customer messages you or a chat is assigned to you. You can change this any time in Settings.</p>
      </div>
    </BottomSheet>
  );
}
