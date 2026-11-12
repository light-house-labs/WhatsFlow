"use client";

import { Fragment, ViewTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronLeft,
  Clock,
  Copy,
  FileText,
  Lock,
  MailOpen,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Quote,
  RotateCw,
  Send,
  StickyNote,
  Trash2,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { ActionSheet, BottomSheet, type SheetAction } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";
import { Avatar, Button, EmptyState, cx } from "@/components/ui";
import { UNREAD_EVENT, useGoBack } from "@/components/mobile/mobile-shell";
import { dropQueued, queueMessage, useOnline, useOutbox, type Queued } from "@/components/mobile/pwa";
import { haptic } from "@/lib/haptics";
import { setNavDirection } from "@/lib/nav-direction";
import { formatWaId } from "@/lib/phone";
import { nowMs } from "@/lib/format";
import { placeholderCount, render } from "@/lib/template-render";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { addNote, assign, markRead, markUnread, sendMedia, sendReply, sendTemplateReply, setStatus, takeOver } from "./actions";
import {
  ContactDetails,
  MessageBubble,
  SLA_MIN,
  WAIT_AMBER_MIN,
  dayKey,
  dayLabel,
  setTyping,
  isTyping,
  shortAge,
  type ListItem,
  type Member,
  type Message,
  type QuickReply,
  type Thread,
  type Tpl,
} from "./inbox-app";

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

const FILTERS = [
  { id: "open", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "unassigned", label: "Unassigned" },
  { id: "bot", label: "Bot" },
  { id: "overdue", label: "Overdue" },
  { id: "enquiries", label: "Enquiries" },
];

const PANELS = ["lead", "orders", "ticket"] as const;

/** Phone inbox: the conversation list as a tab screen, and the chat pushed full screen on top of it (?c=). */
export function MobileInbox({
  me,
  members,
  quickReplies,
  templates,
  hasRealNumber,
  isAdmin,
}: {
  me: string;
  members: Member[];
  quickReplies: QuickReply[];
  templates: Tpl[];
  hasRealNumber: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("c");
  const panel = PANELS.find((p) => p === search.get("panel")) ?? null;
  const toast = useToast();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const r = await fetch(`/api/inbox/conversations?filter=${filter}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setList(j.conversations);
      setLoadError(false);
      if (filter === "open" && !q) window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: (j.conversations as ListItem[]).filter((c) => c.unread > 0).length }));
    } catch {
      // Offline: the service worker answers with the last list it saw; only a miss lands here.
      setLoadError(true);
      setList((l) => l ?? []);
    }
  }, [filter, q]);

  useEffect(() => {
    const first = setTimeout(loadList, 0);
    // Slower while a chat covers the list.
    const t = setInterval(loadList, selected ? 10000 : 3000);
    return () => (clearTimeout(first), clearInterval(t));
  }, [loadList, selected]);

  const act: Act = useCallback(
    async (p) => {
      const r = await p.catch(() => ({ ok: false, error: "Couldn't reach WhatsFlow. Check your connection." }));
      if (!r.ok) {
        haptic("error");
        toast.error(r.error ?? "Something went wrong.");
      }
      await loadList();
      return r.ok;
    },
    [loadList, toast],
  );

  const open = (id: string) => {
    haptic("tap");
    setNavDirection("push");
    router.push(`/inbox?c=${id}`, { scroll: false });
  };

  return (
    <>
      <ListScreen
        list={list}
        loadError={loadError}
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        onRefresh={loadList}
        onOpen={open}
        onAssign={(id) => setAssigning(id)}
        onClose={(id) => act(setStatus(id, "closed"))}
        onUnread={(id) => act(markUnread(id))}
        hasRealNumber={hasRealNumber}
        isAdmin={isAdmin}
      />
      {selected && (
        <ViewTransition enter="wf-page" exit="wf-page" default="none">
          <ChatScreen key={selected} id={selected} me={me} members={members} quickReplies={quickReplies} templates={templates} initialPanel={panel} onChanged={loadList} />
        </ViewTransition>
      )}
      {assigning && <AssignSheet members={members} me={me} current={list?.find((c) => c.id === assigning)?.assigneeId ?? null} onClose={() => setAssigning(null)} onPick={(uid) => act(assign(assigning, uid))} />}
    </>
  );
}

/* ---------------- list ---------------- */

function ListScreen({
  list,
  loadError,
  filter,
  setFilter,
  q,
  setQ,
  onRefresh,
  onOpen,
  onAssign,
  onClose,
  onUnread,
  hasRealNumber,
  isAdmin,
}: {
  list: ListItem[] | null;
  loadError: boolean;
  filter: string;
  setFilter: (f: string) => void;
  q: string;
  setQ: (q: string) => void;
  onRefresh: () => Promise<void>;
  onOpen: (id: string) => void;
  onAssign: (id: string) => void;
  onClose: (id: string) => void;
  onUnread: (id: string) => void;
  hasRealNumber: boolean;
  isAdmin: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const { pull, refreshing } = usePullToRefresh(scroller, onRefresh);
  const [openRow, setOpenRow] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="shrink-0 space-y-2 border-b border-line px-4 pt-1 pb-2">
        <input
          data-bare
          type="search"
          enterKeyHint="search"
          autoCapitalize="none"
          aria-label="Search conversations"
          placeholder="Search name, number, message"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-10 w-full rounded-[10px] bg-fill px-3 text-ink outline-none placeholder:text-placeholder"
        />
        <div role="tablist" aria-label="Filter" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => (haptic("tap"), setFilter(f.id))}
              className={cx(
                "tap h-8 shrink-0 rounded-full px-3.5 text-sm font-medium",
                filter === f.id ? "bg-ink text-surface" : "bg-fill text-muted active:bg-fill-strong",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          aria-hidden={!refreshing}
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
          style={{ height: refreshing ? 48 : pull, opacity: refreshing ? 1 : Math.min(1, pull / 64), transition: pull && !refreshing ? "none" : "height 200ms ease-out, opacity 200ms" }}
        >
          <RotateCw size={18} strokeWidth={2} className={cx("mt-3 text-muted", refreshing && "animate-spin")} style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }} />
        </div>
        <ul style={{ transform: `translateY(${refreshing ? 48 : pull}px)`, transition: pull && !refreshing ? "none" : "transform 200ms ease-out" }}>
          {loadError && list?.length === 0 && (
            <li className="h-full">
              <EmptyState inside variant="error" thing="conversations" primary={{ onClick: () => void onRefresh() }} />
            </li>
          )}
          {list === null &&
            Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="flex h-[76px] items-center gap-3 px-4">
                <div className="size-12 shrink-0 animate-pulse rounded-full bg-fill" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-fill" />
                  <div className="h-3.5 w-4/5 animate-pulse rounded bg-fill" />
                </div>
              </li>
            ))}
          {!loadError &&
            list?.length === 0 &&
            (q || filter !== "open" ? (
              <li>
                <EmptyState inside variant="filtered" primary={{ onClick: () => (setQ(""), setFilter("open")) }} />
              </li>
            ) : (
              <li>
                <EmptyState
                  inside
                  icon={<MessageSquare />}
                  title={hasRealNumber ? "No conversations yet" : "No number connected"}
                  description={hasRealNumber ? "Customer chats land here as soon as they message your number." : "Connect your WhatsApp number to start receiving customer chats."}
                  primary={hasRealNumber ? { label: "Open sandbox phone", href: "/settings/sandbox" } : { label: "Connect WhatsApp number", href: "/settings/whatsapp", allow: isAdmin }}
                  secondary={hasRealNumber ? undefined : { label: "Try the sandbox", href: "/settings/sandbox" }}
                  askAdmin="connect a WhatsApp number"
                />
              </li>
            ))}
          {list?.map((c) => (
            <SwipeRow
              key={c.id}
              open={openRow === c.id}
              onOpenChange={(o) => setOpenRow(o ? c.id : null)}
              onTap={() => onOpen(c.id)}
              leading={{ label: "Unread", icon: <MailOpen size={20} />, tone: "bg-accent text-on-accent", run: () => onUnread(c.id) }}
              trailing={[
                { label: "Assign", icon: <UserPlus size={20} />, tone: "bg-[#71717a] text-white", run: () => onAssign(c.id) },
                { label: "Close", icon: <Check size={20} />, tone: "bg-accent text-on-accent", run: () => onClose(c.id) },
              ]}
            >
              <ConversationRow c={c} />
            </SwipeRow>
          ))}
          {list && list.length > 0 && <li className="py-6 text-center text-13 text-faint">That&apos;s everything</li>}
        </ul>
      </div>
    </div>
  );
}

function ConversationRow({ c }: { c: ListItem }) {
  const waitingMin = c.waitingSince ? (nowMs() - new Date(c.waitingSince).getTime()) / 60000 : 0;
  const waiting = c.handledBy === "human" && c.waitingSince != null;
  const tone = waitingMin >= SLA_MIN ? "text-danger" : waitingMin >= WAIT_AMBER_MIN ? "text-warning" : "text-faint";
  return (
    <div className="flex min-h-[76px] items-center gap-3 pl-4">
      <Avatar name={c.contactName ?? c.contactWaId} size={48} />
      <div className="flex min-h-[76px] min-w-0 flex-1 flex-col justify-center border-b border-line py-2.5 pr-4">
        <div className="flex items-baseline gap-2">
          <span className={cx("row-title min-w-0 flex-1 truncate", c.unread > 0 && "font-semibold")}>{c.contactName ?? formatWaId(c.contactWaId)}</span>
          {waiting ? (
            <span className={cx("inline-flex shrink-0 items-center gap-1 text-13 tabular-nums", tone)}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              {shortAge(c.waitingSince!)}
            </span>
          ) : (
            <span className="row-meta shrink-0 tabular-nums">{shortAge(c.lastMessageAt)}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {c.handledBy === "bot" && <Bot size={14} strokeWidth={1.75} className="shrink-0 text-accent-text" aria-label="Bot" />}
          <span className={cx("min-w-0 flex-1 truncate text-[15px] leading-5", c.unread > 0 ? "text-ink" : "text-muted")}>{c.preview}</span>
          {c.unread > 0 && <span className="count-badge shrink-0">{c.unread}</span>}
        </div>
      </div>
    </div>
  );
}

type SwipeAction = { label: string; icon: ReactNode; tone: string; run: () => void };
const ACTION_W = 76;

/**
 * Mail-style swipe row. Swipe left to reveal the trailing actions (a long swipe runs the last one), swipe
 * right to run the leading action. touch-action: pan-y keeps vertical scrolling with the browser.
 */
function SwipeRow({
  children,
  leading,
  trailing,
  onTap,
  open,
  onOpenChange,
}: {
  children: ReactNode;
  leading: SwipeAction;
  trailing: SwipeAction[];
  onTap: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reveal = trailing.length * ACTION_W;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; base: number; axis: "x" | "y" | null; moved: boolean; armed: boolean } | null>(null);
  const width = useRef(360);
  // While dragging the row follows the finger; otherwise it rests open or closed.
  const x = dragging ? dx : open ? -reveal : 0;

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    width.current = e.currentTarget.offsetWidth;
    g.current = { x: e.clientX, y: e.clientY, base: open ? -reveal : 0, axis: null, moved: false, armed: false };
    setDx(open ? -reveal : 0);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (s.axis === "x") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.axis !== "x") return;
    s.moved = true;
    const next = s.base + mx;
    const full = -width.current * 0.6;
    // Crossing the long-swipe or leading threshold ticks once, like the native list.
    const armed = next < full || next > ACTION_W;
    if (armed !== s.armed) {
      s.armed = armed;
      if (armed) haptic("swipe");
    }
    setDx(next > 0 ? Math.min(next, width.current * 0.5) : Math.max(next, -width.current));
  };
  const up = () => {
    const s = g.current;
    g.current = null;
    setDragging(false);
    if (!s) return;
    if (!s.moved) {
      if (s.axis === null) {
        if (open) onOpenChange(false);
        else onTap();
      }
      return;
    }
    if (dx > ACTION_W) {
      haptic("swipe");
      leading.run();
      onOpenChange(false);
      setDx(0);
    } else if (dx < -width.current * 0.6) {
      haptic("swipe");
      trailing[trailing.length - 1].run();
      onOpenChange(false);
      setDx(0);
    } else if (dx < -reveal / 2) {
      onOpenChange(true);
      setDx(-reveal);
    } else {
      onOpenChange(false);
      setDx(0);
    }
  };

  const trans = dragging ? "none" : "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)";
  return (
    <li className="relative overflow-hidden">
      {/* leading action, revealed on a right swipe */}
      <div aria-hidden className={cx("absolute inset-y-0 left-0 flex items-center pl-6", leading.tone)} style={{ width: Math.max(0, x) }}>
        <span className="flex flex-col items-center gap-1 text-xs font-medium">
          {leading.icon}
          {leading.label}
        </span>
      </div>
      {/* trailing actions, revealed on a left swipe; the last one stretches on a long swipe */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(0, -x) }}>
        {trailing.map((a, i) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => (haptic("tap"), onOpenChange(false), a.run())}
            className={cx("tap flex h-full flex-col items-center justify-center gap-1 overflow-hidden text-xs font-medium", a.tone)}
            style={{ flex: i === trailing.length - 1 && -x > reveal ? `1 0 ${ACTION_W}px` : `0 0 ${-x / trailing.length}px` }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          g.current = null;
          setDragging(false);
        }}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onTap())}
        className="tap relative touch-pan-y bg-surface active:bg-fill"
        style={{ transform: `translateX(${x}px)`, transition: trans }}
      >
        {children}
      </div>
    </li>
  );
}

/** Pull down at the top of the list to refresh. Passive listeners only: the container keeps its native bounce. */
function usePullToRefresh(ref: React.RefObject<HTMLDivElement | null>, onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  useEffect(() => {
    cb.current = onRefresh;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY: number | null = null;
    let current = 0;
    let armed = false;
    const start = (e: TouchEvent) => {
      startY = el.scrollTop <= 0 ? e.touches[0].clientY : null;
      armed = false;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || el.scrollTop > 0) {
        current = 0;
        setPull(0);
        return;
      }
      current = Math.min(96, dy * 0.45);
      if (current >= 64 !== armed) {
        armed = current >= 64;
        if (armed) haptic("tap");
      }
      setPull(current);
    };
    const end = async () => {
      if (startY === null) return;
      startY = null;
      const go = current >= 64;
      current = 0;
      setPull(0);
      if (!go) return;
      setRefreshing(true);
      try {
        await cb.current();
      } finally {
        setRefreshing(false);
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [ref]);
  return { pull, refreshing };
}

function AssignSheet({ members, me, current, onClose, onPick }: { members: Member[]; me: string; current: string | null; onClose: () => void; onPick: (userId: string | null) => void }) {
  const rows: { id: string | null; name: string }[] = [{ id: null, name: "Unassigned" }, ...members.map((m) => ({ id: m.id, name: m.id === me ? `${m.name} (me)` : m.name }))];
  return (
    <BottomSheet title="Assign to" onClose={onClose}>
      <ul className="px-2 pb-2">
        {rows.map((r) => (
          <li key={r.id ?? "none"}>
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                onPick(r.id);
                onClose();
              }}
              className="tap flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left active:bg-fill"
            >
              {r.id ? <Avatar name={r.name} size={32} /> : <span className="size-8 rounded-full border border-dashed border-line-strong" aria-hidden />}
              <span className="row-title flex-1 truncate">{r.name}</span>
              {current === r.id && <Check size={18} className="text-accent" aria-label="Current" />}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

/* ---------------- chat ---------------- */

const WINDOW_MS = 24 * 3600_000;

function ChatScreen({
  id,
  me,
  members,
  quickReplies,
  templates,
  initialPanel,
  onChanged,
}: {
  id: string;
  me: string;
  members: Member[];
  quickReplies: QuickReply[];
  templates: Tpl[];
  initialPanel: (typeof PANELS)[number] | null;
  onChanged: () => Promise<void>;
}) {
  const goBack = useGoBack();
  const toast = useToast();
  const online = useOnline();
  const queued = useOutbox(id);
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<null | "contact" | "menu" | "assign" | "attach" | "quick" | "template">(initialPanel ? "contact" : null);
  const [msgActions, setMsgActions] = useState<{ m?: Message; q?: Queued } | null>(null);
  const [draft, setDraft] = useState("");
  useVisualViewport();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/inbox/conversations/${id}?typing=${isTyping() ? 1 : 0}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setThread(await r.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 2500);
    markRead(id)
      .then(onChanged)
      .catch(() => {});
    return () => (clearTimeout(first), clearInterval(t), setTyping(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per conversation
  }, [id]);

  const act: Act = useCallback(
    async (p) => {
      const r = await p.catch(() => ({ ok: false, error: "Couldn't reach WhatsFlow. Check your connection." }));
      if (!r.ok) {
        haptic("error");
        toast.error(r.error ?? "Something went wrong.");
      }
      await Promise.all([load(), onChanged()]);
      return r.ok;
    },
    [load, onChanged, toast],
  );

  const contact = thread?.contact;
  const conv = thread?.conversation;
  const name = contact ? (contact.name ?? formatWaId(contact.waId)) : "";

  const menu: SheetAction[] = conv
    ? [
        ...(conv.handledBy === "bot" ? [{ label: "Take over from bot", icon: <Bot />, onSelect: () => void act(takeOver(id)) }] : []),
        { label: "Assign", description: members.find((m) => m.id === conv.assigneeId)?.name ?? "Unassigned", icon: <UserPlus />, onSelect: () => setSheet("assign") },
        { label: "Mark as unread", icon: <MailOpen />, onSelect: () => void act(markUnread(id)).then((ok) => ok && goBack()) },
        conv.status === "closed"
          ? { label: "Reopen", icon: <RotateCw />, onSelect: () => void act(setStatus(id, "open")) }
          : { label: "Close conversation", icon: <Check />, onSelect: () => void act(setStatus(id, "closed")).then((ok) => ok && goBack()) },
      ]
    : [];

  return (
    <section
      aria-label="Conversation"
      className="fixed inset-x-0 z-30 flex flex-col bg-app md:hidden"
      style={{ top: "var(--vv-top, 0px)", height: "var(--vv-h, 100dvh)" }}
    >
      <header className="shrink-0 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 pr-1">
          <button type="button" onClick={goBack} aria-label="Back to inbox" className="tap grid h-11 w-10 place-items-center text-accent-text active:opacity-60">
            <ChevronLeft size={28} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => contact && setSheet("contact")} disabled={!contact} className="tap flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left active:bg-fill">
            {contact ? <Avatar name={contact.name ?? contact.waId} size={36} /> : <span className="size-9 animate-pulse rounded-full bg-fill" />}
            <span className="min-w-0 flex-1">
              {contact ? (
                <>
                  <span className="block truncate text-base leading-5 font-semibold">{name}</span>
                  <span className="block truncate text-13 leading-4 text-faint">
                    {thread.viewers.length > 0
                      ? thread.viewers.map((v) => `${v.name} ${v.typing ? "is replying…" : "is viewing"}`).join(" · ")
                      : conv?.handledBy === "bot"
                        ? "Bot is handling this chat"
                        : `${members.find((m) => m.id === conv?.assigneeId)?.name ?? "Unassigned"} · tap for details`}
                  </span>
                </>
              ) : (
                <span className="block h-4 w-32 animate-pulse rounded bg-fill" />
              )}
            </span>
          </button>
          <button type="button" aria-label="Conversation actions" onClick={() => setSheet("menu")} disabled={!conv} className="tap grid size-11 place-items-center rounded-full text-ink active:bg-fill">
            <MoreHorizontal size={22} strokeWidth={1.75} />
          </button>
        </div>
        {!online && <div className="bg-warning-soft px-4 py-1.5 text-13 text-warning">Offline. Messages you send will go out when you&apos;re back.</div>}
      </header>

      {thread ? (
        <Messages thread={thread} members={members} queued={queued} onLongPress={(x) => (haptic("longPress"), setMsgActions(x))} />
      ) : failed ? (
        <div className="flex-1">
          <EmptyState inside variant="error" thing="this conversation" primary={{ onClick: () => void load() }} />
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-hidden px-3 py-4" aria-busy>
          {[60, 45, 70, 50].map((w, i) => (
            <div key={i} className={cx("h-12 animate-pulse rounded-2xl bg-fill", i % 2 ? "ml-auto" : "")} style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {thread && (
        <Composer
          key={thread.conversation.id}
          thread={thread}
          quickReplies={quickReplies}
          templates={templates}
          text={draft}
          setText={setDraft}
          act={act}
          online={online}
          openSheet={(s) => setSheet(s)}
        />
      )}

      {sheet === "contact" && thread && (
        <BottomSheet title={name} hideTitle onClose={() => setSheet(null)} snaps={[0.62, 0.94]}>
          <div className="flex items-center gap-3 px-4 pb-4">
            <Avatar name={thread.contact.name ?? thread.contact.waId} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold">{thread.contact.name ?? "Unknown name"}</div>
              <a href={`tel:+${thread.contact.waId}`} className="text-13 text-faint">
                {formatWaId(thread.contact.waId)}
              </a>
            </div>
            <Link href={`/contacts/${thread.contact.id}`} className="tap inline-flex h-9 items-center gap-1 rounded-full bg-fill px-3 text-13 font-medium active:bg-fill-strong">
              Open <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="border-t border-line">
            <ContactDetails thread={thread} act={act} initialOpen={initialPanel} />
          </div>
        </BottomSheet>
      )}
      {sheet === "menu" && <ActionSheet title={name || "Conversation"} actions={menu} onClose={() => setSheet(null)} />}
      {sheet === "assign" && conv && <AssignSheet members={members} me={me} current={conv.assigneeId} onClose={() => setSheet(null)} onPick={(uid) => act(assign(id, uid))} />}
      {sheet === "quick" && (
        <BottomSheet title="Quick replies" onClose={() => setSheet(null)} snaps={quickReplies.length > 5 ? [0.55, 0.92] : undefined}>
          {quickReplies.length === 0 ? (
            <div className="px-6 pb-8 text-center text-sm text-muted">
              No quick replies yet. Add them in{" "}
              <Link href="/settings" className="link">
                Settings
              </Link>
              .
            </div>
          ) : (
            <ul className="px-2 pb-2">
              {quickReplies.map((r) => (
                <li key={r.shortcut}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setDraft(r.body);
                      setSheet(null);
                    }}
                    className="tap w-full rounded-xl px-3 py-3 text-left active:bg-fill"
                  >
                    <span className="row-title block">/{r.shortcut}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{r.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </BottomSheet>
      )}
      {sheet === "template" && thread && <TemplateSheet id={id} templates={templates} act={act} onClose={() => setSheet(null)} />}
      {msgActions && (
        <ActionSheet
          title="Message"
          onClose={() => setMsgActions(null)}
          actions={messageActions(msgActions, {
            copy: (t) => navigator.clipboard?.writeText(t).then(() => toast.success("Copied")),
            quote: (t) => setDraft((d) => `> ${t.split("\n").join("\n> ")}\n${d}`),
            retry: (q) => {
              dropQueued(q.id);
              void act(sendReply(q.conversationId, q.text));
            },
            discard: (q) => dropQueued(q.id),
          })}
        />
      )}
    </section>
  );
}

function messageActions(
  x: { m?: Message; q?: Queued },
  h: { copy: (t: string) => void; quote: (t: string) => void; retry: (q: Queued) => void; discard: (q: Queued) => void },
): SheetAction[] {
  const text = x.m?.body ?? x.q?.text ?? "";
  const out: SheetAction[] = [];
  if (text) out.push({ label: "Copy text", icon: <Copy />, onSelect: () => h.copy(text) }, { label: "Quote in reply", icon: <Quote />, onSelect: () => h.quote(text) });
  if (x.q) out.push({ label: "Send now", icon: <RotateCw />, onSelect: () => h.retry(x.q!) }, { label: "Discard", icon: <Trash2 />, danger: true, onSelect: () => h.discard(x.q!) });
  return out;
}

function Messages({
  thread,
  members,
  queued,
  onLongPress,
}: {
  thread: Thread;
  members: Member[];
  queued: Queued[];
  onLongPress: (x: { m?: Message; q?: Queued }) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const memberName = (uid: string | null) => members.find((m) => m.id === uid)?.name ?? "Teammate";
  const items = useMemo(
    () =>
      [...thread.messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, m })), ...thread.notes.map((n) => ({ kind: "note" as const, at: n.createdAt, n }))].sort((a, b) =>
        a.at.localeCompare(b.at),
      ),
    [thread.messages, thread.notes],
  );
  const count = items.length + queued.length;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);
  // Keep the newest message in view when the keyboard opens and the screen shrinks.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const keep = () => bottom.current?.scrollIntoView({ block: "end" });
    vv.addEventListener("resize", keep);
    return () => vv.removeEventListener("resize", keep);
  }, []);
  const senderKey = (it: (typeof items)[number] | undefined) => (!it ? "" : it.kind === "note" ? "note" : `${it.m.direction}:${it.m.senderKind}:${it.m.senderUserId ?? ""}`);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3">
      {items.length === 0 && <p className="m-auto text-sm text-muted">No messages yet.</p>}
      {items.map((it, i) => {
        const prev = items[i - 1];
        const newDay = !prev || dayKey(prev.at) !== dayKey(it.at);
        const first = newDay || senderKey(prev) !== senderKey(it);
        const gap = newDay ? "" : first ? "mt-3" : "mt-1";
        return (
          <Fragment key={it.kind === "note" ? it.n.id : it.m.id}>
            {newDay && (
              <div className="my-3 flex justify-center first:mt-0" role="separator" aria-label={dayLabel(it.at)}>
                <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-faint shadow-xs">{dayLabel(it.at)}</span>
              </div>
            )}
            {it.kind === "note" ? (
              <div className={cx("mx-auto w-full max-w-[90%] rounded-xl bg-warning-soft px-3 py-2 text-[15px] leading-5", gap)}>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <StickyNote size={11} strokeWidth={1.75} /> Note · {it.n.authorId ? memberName(it.n.authorId) : "Reminder"}
                </div>
                <div className="whitespace-pre-wrap">{it.n.body}</div>
              </div>
            ) : (
              <LongPress onLongPress={() => onLongPress({ m: it.m })} className={gap}>
                <MessageBubble m={it.m} who={it.m.senderUserId ? memberName(it.m.senderUserId) : null} contactName={thread.contact.name ?? thread.contact.waId} first={first} />
              </LongPress>
            )}
          </Fragment>
        );
      })}
      {queued.map((q) => (
        <LongPress key={q.id} onLongPress={() => onLongPress({ q })} className="mt-1">
          <div className="flex justify-end">
            <div className="max-w-[82%] rounded-lg bg-bubble-agent px-3 py-2 text-sm text-ink opacity-80">
              <div className="whitespace-pre-wrap break-words">{q.text}</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-xs text-faint">
                <Clock size={12} aria-hidden /> Waiting for connection
              </div>
            </div>
          </div>
        </LongPress>
      ))}
      <div ref={bottom} />
    </div>
  );
}

/** Hold a finger on it for 450ms (or right-click / Android's context menu) to run `onLongPress`. Scrolling cancels it. */
function LongPress({ children, onLongPress, className }: { children: ReactNode; onLongPress: () => void; className?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return (
    <div
      className={cx("select-none [-webkit-touch-callout:none]", className)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, 450);
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!fired.current) onLongPress();
        cancel();
      }}
    >
      {children}
    </div>
  );
}

function Composer({
  thread,
  quickReplies,
  templates,
  text,
  setText,
  act,
  online,
  openSheet,
}: {
  thread: Thread;
  quickReplies: QuickReply[];
  templates: Tpl[];
  text: string;
  setText: (t: string | ((t: string) => string)) => void;
  act: Act;
  online: boolean;
  openSheet: (s: "attach" | "quick" | "template") => void;
}) {
  const id = thread.conversation.id;
  const [note, setNote] = useState(false);
  const [attach, setAttach] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string | null; kind: "image" | "document" | "video" | "audio" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const slash = text.startsWith("/") ? quickReplies.filter((r) => r.shortcut.startsWith(text.slice(1).toLowerCase())).slice(0, 5) : [];
  const lastIn = thread.conversation.lastInboundAt ? new Date(thread.conversation.lastInboundAt).getTime() : null;
  const left = lastIn ? lastIn + WINDOW_MS - nowMs() : 0;
  const canSend = (file ? true : !!text.trim()) && !pending && !uploading;

  const submit = () =>
    start(async () => {
      const body = text;
      if (note) {
        if (await act(addNote(id, body))) {
          setText("");
          setNote(false);
        }
        return;
      }
      haptic("send");
      if (file) {
        if (await act(sendMedia(id, file.kind, file.url, body, file.name))) {
          setText("");
          setFile(null);
        }
        return;
      }
      setText("");
      setTyping(false);
      area.current?.focus();
      if (!online) return queueMessage(id, body);
      try {
        const r = await sendReply(id, body);
        if (!r.ok) {
          haptic("error");
          setText(body);
          await act(Promise.resolve(r));
          return;
        }
        await act(Promise.resolve(r));
      } catch {
        // Network dropped mid-send: keep it and retry when the connection is back.
        queueMessage(id, body);
      }
    });

  const upload = async (f: File) => {
    setUploading(true);
    const body = new FormData();
    body.set("file", f);
    try {
      const r = await fetch("/api/files", { method: "POST", body });
      const j = (await r.json().catch(() => ({}))) as { url?: string; kind?: "image" | "document" | "video" | "audio"; name?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? "Upload failed.");
      setFile({ url: j.url, name: j.name ?? f.name, kind: j.kind ?? "document" });
    } catch (e) {
      await act(Promise.resolve({ ok: false, error: (e as Error).message || "Upload failed." }));
    } finally {
      setUploading(false);
    }
  };

  const iconBtn = "tap grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-fill disabled:opacity-40";

  if (!thread.windowOpen && !note)
    return (
      <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] [html[data-kb]_&]:pb-3">
        <p className="flex items-start gap-2 text-13 text-muted">
          <Lock size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          The 24-hour reply window is closed. WhatsApp only allows an approved template until the customer writes back.
        </p>
        <div className="mt-3 flex gap-2">
          <Button className="h-11 flex-1 text-base" disabled={!templates.length} onClick={() => openSheet("template")}>
            <FileText size={16} strokeWidth={1.75} /> {templates.length ? "Send template" : "No approved templates"}
          </Button>
          <Button variant="secondary" className="h-11 text-base" onClick={() => setNote(true)}>
            <StickyNote size={16} strokeWidth={1.75} /> Note
          </Button>
        </div>
      </div>
    );

  return (
    <div className={cx("relative shrink-0 border-t border-line pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] [html[data-kb]_&]:pb-1.5", note ? "bg-warning-soft" : "bg-surface")}>
      {thread.windowOpen && left > 0 && left < 2 * 3600_000 && !note && (
        <div className="flex items-center gap-1.5 px-4 pb-1 text-xs text-warning">
          <Clock size={12} aria-hidden /> Reply window closes in {Math.max(1, Math.round(left / 60000))} min
        </div>
      )}
      {slash.length > 0 && (
        <ul className="absolute inset-x-2 bottom-full mb-2 overflow-hidden rounded-xl bg-surface shadow-menu">
          {slash.map((r) => (
            <li key={r.shortcut}>
              <button type="button" onClick={() => setText(r.body)} className="tap w-full px-3 py-2.5 text-left active:bg-fill">
                <span className="font-medium">/{r.shortcut}</span> <span className="text-sm text-muted">{r.body.slice(0, 60)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <div className="flex items-center gap-2 px-4 pb-1 text-xs font-semibold text-warning">
          <StickyNote size={12} aria-hidden /> Internal note · only your team sees this
          <button type="button" onClick={() => setNote(false)} aria-label="Back to reply" className="tap ml-auto grid size-8 place-items-center rounded-full active:bg-fill">
            <X size={14} />
          </button>
        </div>
      )}
      {file && (
        <div className="mx-3 mb-1.5 flex items-center gap-2 rounded-lg bg-fill px-3 py-2 text-13">
          <Paperclip size={14} aria-hidden className="text-muted" />
          <span className="min-w-0 flex-1 truncate">{file.name ?? "Attachment"}</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="tap grid size-8 place-items-center rounded-full active:bg-fill-strong">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-0.5 px-1.5">
        <button type="button" aria-label="Attach" aria-haspopup="dialog" onClick={() => setAttach(true)} disabled={uploading} className={iconBtn}>
          {uploading ? <RotateCw size={20} className="animate-spin" /> : <Paperclip size={22} strokeWidth={1.75} />}
        </button>
        <textarea
          ref={area}
          data-bare
          rows={1}
          value={text}
          enterKeyHint="send"
          aria-label={note ? "Internal note" : file ? "Caption" : "Message"}
          placeholder={note ? "Note for your team" : file ? "Add a caption" : "Message"}
          onChange={(e) => {
            setText(e.target.value);
            setTyping(e.target.value.trim().length > 0 && !note);
          }}
          className="my-1 block max-h-[132px] min-h-9 flex-1 resize-none rounded-[18px] border border-line-input bg-field px-3.5 py-[6px] leading-6 text-ink outline-none placeholder:text-placeholder"
        />
        {!text && !file && !note ? (
          <button type="button" aria-label="Quick replies" aria-haspopup="dialog" onClick={() => openSheet("quick")} className={iconBtn}>
            <Zap size={22} strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={note ? "Add note" : "Send"}
            disabled={!canSend}
            onPointerDown={(e) => e.preventDefault() /* keep the keyboard up */}
            onClick={submit}
            className={cx("tap press m-1 grid size-9 shrink-0 place-items-center rounded-full text-on-accent disabled:opacity-40", note ? "bg-warning" : "bg-accent")}
          >
            {note ? <StickyNote size={17} strokeWidth={2} /> : <Send size={17} strokeWidth={2} className="-ml-0.5" />}
          </button>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,audio/mpeg,audio/ogg,.docx,.xlsx,.pptx,.txt,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      {attach && (
        <ActionSheet
          title="Add to message"
          onClose={() => setAttach(false)}
          actions={[
            { label: "Photo or file", description: "Images, PDFs, video, audio, documents", icon: <Paperclip />, onSelect: () => picker.current?.click() },
            { label: "Quick reply", icon: <Zap />, onSelect: () => openSheet("quick") },
            { label: "Template", description: templates.length ? undefined : "No approved templates yet", disabled: !templates.length, icon: <FileText />, onSelect: () => openSheet("template") },
            { label: "Internal note", description: "Only your team sees it", icon: <StickyNote />, onSelect: () => setNote(true) },
          ]}
        />
      )}
    </div>
  );
}

function TemplateSheet({ id, templates, act, onClose }: { id: string; templates: Tpl[]; act: Act; onClose: () => void }) {
  const [tplId, setTplId] = useState(templates[0]?.id ?? "");
  const [vars, setVars] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const tpl = templates.find((t) => t.id === tplId);
  const n = tpl ? placeholderCount(tpl.body) : 0;
  return (
    <BottomSheet
      title="Send a template"
      onClose={onClose}
      snaps={[0.7, 0.94]}
      footer={
        <Button
          className="h-12 w-full text-base"
          disabled={!tpl || pending}
          onClick={() =>
            start(async () => {
              haptic("send");
              if (await act(sendTemplateReply(id, tplId, vars))) onClose();
            })
          }
        >
          <Send size={16} strokeWidth={1.75} /> {pending ? "Sending…" : "Send template"}
        </Button>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <ul className="overflow-hidden rounded-xl border border-line">
          {templates.map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => (setTplId(t.id), setVars([]))} className="tap flex min-h-12 w-full items-center gap-3 px-3 text-left active:bg-fill">
                <span className="min-w-0 flex-1">
                  <span className="row-title block truncate">{t.name}</span>
                  <span className="row-meta block">{t.category.toLowerCase()}</span>
                </span>
                {t.id === tplId && <Check size={18} className="text-accent" aria-label="Selected" />}
              </button>
            </li>
          ))}
        </ul>
        {Array.from({ length: n }).map((_, i) => (
          <label key={i} className="block">
            <span className="mb-1 block text-13 font-medium text-muted">{`Variable {{${i + 1}}}`}</span>
            <input
              value={vars[i] ?? ""}
              onChange={(e) => setVars((v) => Object.assign([...v], { [i]: e.target.value }))}
              className="h-11 w-full rounded-lg border border-line-input bg-field px-3 text-ink"
            />
          </label>
        ))}
        {tpl && (
          <div className="rounded-xl bg-[var(--wf-wa-bg)] p-3">
            <div className="ml-auto max-w-[85%] rounded-lg bg-[var(--wf-wa-out)] px-3 py-2 text-[15px] leading-5 whitespace-pre-wrap">{render(tpl.body, vars)}</div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
