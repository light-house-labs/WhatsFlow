"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Lock,
  MessageSquare,
  Package,
  Paperclip,
  Plus,
  Search,
  Send,
  StickyNote,
  Ticket,
  TrendingUp,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  EndOfList,
  Input,
  SectionLabel,
  Select,
  cx,
} from "@/components/ui";
import { SHORTCUTS } from "@/lib/shortcuts";
import { usePlatform } from "@/lib/platform";
import { Kbd, Tip, useShortcutMatcher } from "@/components/shortcuts";
import { HelpButton } from "@/components/help-drawer";
import { formatWaId } from "@/lib/phone";
import { dateTime, nowMs } from "@/lib/format";
import { placeholderCount, render } from "@/lib/template-render";
import {
  addNote,
  assign,
  convertToLead,
  convertToTicket,
  markRead,
  sendMedia,
  sendReply,
  sendTemplateReply,
  setLabels,
  setStatus,
  takeOver,
} from "./actions";

type Member = { id: string; name: string };
type QuickReply = { shortcut: string; body: string };
type Tpl = { id: string; name: string; body: string; category: string };

type ListItem = {
  id: string;
  status: string;
  handledBy: "bot" | "human";
  labels: string[];
  unread: number;
  preview: string | null;
  lastMessageAt: string;
  waitingSince: string | null;
  assigneeId: string | null;
  contactName: string | null;
  contactWaId: string;
};

type Message = {
  id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  payload: Record<string, unknown>;
  status: string;
  error: string | null;
  senderKind: string;
  senderUserId: string | null;
  createdAt: string;
};
type Note = {
  id: string;
  body: string;
  authorId: string | null;
  createdAt: string;
};

type Thread = {
  conversation: {
    id: string;
    status: string;
    handledBy: "bot" | "human";
    assigneeId: string | null;
    labels: string[];
    lastInboundAt: string | null;
  };
  contact: {
    id: string;
    name: string | null;
    waId: string;
    tags: string[];
    optedOutAt: string | null;
    source: string;
    createdAt: string;
  };
  number: { displayPhone: string; provider: string };
  windowOpen: boolean;
  messages: Message[];
  notes: Note[];
  leads: { id: string; title: string }[];
  tickets: { id: string; number: number; subject: string; status: string }[];
  orders: {
    id: string;
    number: number;
    totalMinor: number;
    currency: string;
    status: string;
    paymentStatus: string;
  }[];
  appointment: { startAt: string; service: string } | null;
  viewers: { name: string; typing: boolean }[];
  ad?: {
    headline: string | null;
    sourceUrl: string | null;
    sourceType: string | null;
  } | null;
};

// Whether this browser's agent is mid-reply; sent with each poll for the collision indicator.
let typingNow = false;

const FILTERS = [
  { id: "open", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "unassigned", label: "Unassigned" },
  { id: "bot", label: "Bot" },
  { id: "closed", label: "Closed" },
];

// Waiting time stays text-3, turns amber past 30 minutes, red past the reply SLA.
const WAIT_AMBER_MIN = 30;
const SLA_MIN = 120;

/** Compact age for list rows: 5m, 17h, 3d. */
function shortAge(from: string): string {
  const min = Math.max(
    0,
    Math.floor((nowMs() - new Date(from).getTime()) / 60000),
  );
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

/** "Today", "Yesterday", or a short date, in the viewer's time zone. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(nowMs())) - day(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(diff > 300 ? { year: "numeric" } : {}),
  });
}
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function InboxApp({
  me,
  members,
  quickReplies,
  templates,
  initialId,
  hasRealNumber,
  isAdmin,
}: {
  me: string;
  members: Member[];
  quickReplies: QuickReply[];
  templates: Tpl[];
  initialId: string | null;
  hasRealNumber: boolean;
  isAdmin: boolean;
}) {
  const { isTouchOnly } = usePlatform();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialId);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const r = await fetch(
      `/api/inbox/conversations?filter=${filter}&q=${encodeURIComponent(q)}`,
      { cache: "no-store" },
    );
    if (!r.ok) return;
    const j = await r.json();
    setList(j.conversations);
  }, [filter, q]);

  const loadThread = useCallback(async () => {
    if (!selected) {
      setThread(null);
      return;
    }
    const r = await fetch(
      `/api/inbox/conversations/${selected}?typing=${typingNow ? 1 : 0}`,
      { cache: "no-store" },
    );
    if (r.ok) setThread(await r.json());
  }, [selected]);

  useEffect(() => {
    const first = setTimeout(loadList, 0);
    const t = setInterval(loadList, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList]);

  useEffect(() => {
    const first = setTimeout(loadThread, 0);
    const t = setInterval(loadThread, 2500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadThread]);

  useEffect(() => {
    if (selected) markRead(selected).then(loadList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const refresh = useCallback(async () => {
    await Promise.all([loadList(), loadThread()]);
  }, [loadList, loadThread]);

  const act = useCallback(
    async (p: Promise<{ ok: boolean; error?: string }>) => {
      const r = await p;
      setError(r.ok ? null : (r.error ?? "Something went wrong."));
      await refresh();
      return r.ok;
    },
    [refresh],
  );

  return (
    <div className="flex h-full bg-surface">
      {/* list */}
      <section
        className="flex w-80 shrink-0 flex-col border-r border-line bg-surface"
        aria-label="Conversations"
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-4">
          <h1 className="font-sans text-xl font-semibold leading-7 tracking-[-0.01em]">
            Inbox
          </h1>
          {list && (
            <span className="text-sm font-medium text-faint tabular-nums">
              {list.length}
            </span>
          )}
          <HelpButton className="ml-auto" />
        </div>
        <div className="border-b border-line px-4 py-3">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              data-bare
              aria-label="Search conversations"
              placeholder="Search name, number, message"
              className="pl-8"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div
            className="mt-3 flex w-full items-center gap-0.5 rounded-md bg-fill p-0.5"
            role="tablist"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cx(
                  "h-7 flex-auto whitespace-nowrap rounded border px-1.5 text-13 font-medium transition-surface",
                  filter === f.id
                    ? "border-line bg-surface text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list === null &&
            Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="h-[72px] animate-pulse border-b border-line bg-fill/50"
              />
            ))}
          {list?.length === 0 &&
            (q || filter !== "open" ? (
              <li>
                <EmptyState
                  inside
                  variant="filtered"
                  primary={{ onClick: () => (setQ(""), setFilter("open")) }}
                />
              </li>
            ) : (
              <li>
                {hasRealNumber ? (
                  <EmptyState
                    inside
                    icon={<MessageSquare />}
                    title="No conversations yet"
                    description="Customer chats land here as soon as they message your number."
                    primary={{
                      label: "Open sandbox phone",
                      href: "/settings/sandbox",
                    }}
                    secondary={{
                      label: "Send a broadcast",
                      href: "/campaigns/new",
                      allow: isAdmin,
                    }}
                  />
                ) : (
                  <EmptyState
                    inside
                    icon={<MessageSquare />}
                    title="No number connected"
                    description="Connect your WhatsApp number to start receiving customer chats."
                    primary={{
                      label: "Connect WhatsApp number",
                      href: "/settings/whatsapp",
                      allow: isAdmin,
                    }}
                    secondary={{
                      label: "Try the sandbox",
                      href: "/settings/sandbox",
                    }}
                    askAdmin="connect a WhatsApp number"
                  />
                )}
              </li>
            ))}
          {list?.map((c) => {
            const waitingMin = c.waitingSince
              ? (nowMs() - new Date(c.waitingSince).getTime()) / 60000
              : 0;
            const waiting = c.handledBy === "human" && c.waitingSince != null;
            const waitTone =
              waitingMin >= SLA_MIN
                ? "text-danger"
                : waitingMin >= WAIT_AMBER_MIN
                  ? "text-warning"
                  : "text-faint";
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  aria-current={selected === c.id ? "true" : undefined}
                  className={cx(
                    "relative flex h-[68px] w-full items-center gap-3 border-b border-line px-3 text-left transition-surface",
                    "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent before:transition-opacity before:duration-[120ms]",
                    selected === c.id
                      ? "bg-selected before:opacity-100"
                      : "before:opacity-0 hover:bg-fill",
                  )}
                >
                  <Avatar name={c.contactName ?? c.contactWaId} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {c.contactName ?? formatWaId(c.contactWaId)}
                      </span>
                      {waiting ? (
                        <span
                          className={cx(
                            "ml-auto inline-flex shrink-0 items-center gap-1 text-xs tabular-nums",
                            waitTone,
                          )}
                          title="Waiting for a reply"
                        >
                          <span
                            className="size-1.5 rounded-full bg-current"
                            aria-hidden
                          />
                          {shortAge(c.waitingSince!)}
                        </span>
                      ) : (
                        <span className="ml-auto shrink-0 text-xs text-faint tabular-nums">
                          {shortAge(c.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="truncate text-13 text-muted">
                        {c.preview}
                      </span>
                      {c.unread > 0 && (
                        <span className="count-badge ml-auto shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {list && list.length > 0 && <EndOfList />}
        </ul>
      </section>

      {/* thread */}
      {thread && selected ? (
        <ThreadView
          key={selected}
          me={me}
          thread={thread}
          members={members}
          quickReplies={quickReplies}
          templates={templates}
          error={error}
          clearError={() => setError(null)}
          act={act}
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col bg-canvas">
          <div
            className="h-16 shrink-0 border-b border-line bg-surface"
            aria-hidden
          />
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              inside
              icon={<MessageSquare />}
              title="Select a conversation"
              description="Pick one from the list to read and reply."
              hint={
                isTouchOnly ? undefined : (
                  <dl className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                    {[
                      [SHORTCUTS.searchSlash, "Quick replies"],
                      [SHORTCUTS.send, "Send"],
                      [SHORTCUTS.newLine, "New line"],
                    ].map(([k, label]) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <dt>
                          <Kbd keys={k} />
                        </dt>
                        <dd>{label}</dd>
                      </div>
                    ))}
                  </dl>
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Ticks({ status }: { status: string }) {
  if (status === "failed")
    return (
      <AlertTriangle size={12} className="text-danger" aria-label="Failed" />
    );
  if (status === "queued") return <Clock size={12} aria-label="Sending" />;
  if (status === "sent") return <Check size={12} aria-label="Sent" />;
  if (status === "delivered")
    return <CheckCheck size={12} aria-label="Delivered" />;
  if (status === "read")
    return <CheckCheck size={12} className="text-accent" aria-label="Read" />;
  return null;
}

function ThreadView({
  me,
  thread,
  members,
  quickReplies,
  templates,
  error,
  clearError,
  act,
}: {
  me: string;
  thread: Thread;
  members: Member[];
  quickReplies: QuickReply[];
  templates: Tpl[];
  error: string | null;
  clearError: () => void;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
}) {
  const matches = useShortcutMatcher();
  const { isTouchOnly } = usePlatform();
  const { conversation: conv, contact } = thread;
  const id = conv.id;
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note" | "media">("reply");
  const [mediaType, setMediaType] = useState<
    "image" | "document" | "video" | "audio"
  >("image");
  const [mediaLink, setMediaLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tplId, setTplId] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const memberName = (uid: string | null) =>
    members.find((m) => m.id === uid)?.name ?? "Teammate";

  const items = useMemo(() => {
    const all = [
      ...thread.messages.map((m) => ({
        kind: "msg" as const,
        at: m.createdAt,
        m,
      })),
      ...thread.notes.map((n) => ({
        kind: "note" as const,
        at: n.createdAt,
        n,
      })),
    ];
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }, [thread.messages, thread.notes]);

  const senderKey = (it: (typeof items)[number] | undefined) =>
    !it
      ? ""
      : it.kind === "note"
        ? "note"
        : `${it.m.direction}:${it.m.senderKind}:${it.m.senderUserId ?? ""}`;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  const slash = text.startsWith("/")
    ? quickReplies.filter((r) =>
        r.shortcut.startsWith(text.slice(1).toLowerCase()),
      )
    : [];
  const tpl = templates.find((t) => t.id === tplId);
  const tplVars = tpl ? placeholderCount(tpl.body) : 0;

  const submit = () =>
    start(async () => {
      if (mode === "note") {
        if (await act(addNote(id, text))) setText("");
        return;
      }
      if (mode === "media") {
        if (await act(sendMedia(id, mediaType, mediaLink, text, fileName))) {
          setText("");
          setMediaLink("");
          setFileName(null);
        }
        return;
      }
      if (await act(sendReply(id, text))) {
        setText("");
        typingNow = false;
      }
    });

  const tabClass = (on: boolean, tone?: "warn") =>
    cx(
      "-mb-px inline-flex h-7 items-center gap-1.5 border-b-2 text-13 font-medium transition-surface",
      on
        ? cx("border-accent", tone === "warn" ? "text-warning" : "text-ink")
        : "border-transparent text-muted hover:text-ink",
    );
  const canSend =
    (mode === "media" ? !!mediaLink.trim() : !!text.trim()) && !pending;
  // Textarea: 2 rows minimum, grows to 6
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text, mode]);

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-line"
        aria-label="Conversation"
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-5">
          <Avatar name={contact.name ?? contact.waId} />
          <div className="min-w-0">
            <div className="truncate font-sans text-base font-semibold leading-6">
              {contact.name ?? formatWaId(contact.waId)}
            </div>
            <div className="truncate text-xs leading-4 text-faint">
              {formatWaId(contact.waId)} · via {thread.number.displayPhone}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {thread.viewers.length > 0 && (
              <span className="mr-2 hidden items-center gap-1.5 text-xs text-warning lg:inline-flex">
                <span
                  className="size-1.5 rounded-full bg-current"
                  aria-hidden
                />
                {thread.viewers
                  .map(
                    (v) =>
                      `${v.name} ${v.typing ? "is replying…" : "is viewing"}`,
                  )
                  .join(" · ")}
              </span>
            )}
            <span
              className={cx(
                "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                conv.handledBy === "bot"
                  ? "bg-accent-soft text-accent-text"
                  : "bg-fill text-muted",
              )}
            >
              {conv.handledBy === "bot" && (
                <Bot size={12} strokeWidth={1.75} aria-hidden />
              )}
              {conv.handledBy === "bot" ? "Bot" : "Human"}
            </span>
            {conv.handledBy === "bot" && (
              <Button variant="ghost" onClick={() => act(takeOver(id))}>
                Take over
              </Button>
            )}
            <Select
              aria-label="Assignee"
              className="w-40"
              value={conv.assigneeId ?? ""}
              onChange={(e) => act(assign(id, e.target.value || null))}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === me ? `${m.name} (me)` : m.name}
                </option>
              ))}
            </Select>
            {conv.status === "closed" ? (
              <Button
                variant="secondary"
                onClick={() => act(setStatus(id, "open"))}
              >
                Reopen
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => act(setStatus(id, "closed"))}
              >
                <Check size={14} strokeWidth={1.75} /> Close
              </Button>
            )}
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto bg-canvas px-6 py-4">
          {items.map((it, i) => {
            const prev = items[i - 1];
            const newDay = !prev || dayKey(prev.at) !== dayKey(it.at);
            const first = newDay || senderKey(prev) !== senderKey(it);
            const gap = newDay ? "" : first ? "mt-4" : "mt-2";
            return (
              <Fragment key={it.kind === "note" ? it.n.id : it.m.id}>
                {newDay && (
                  <div
                    className="my-4 flex items-center gap-3 first:mt-0"
                    role="separator"
                    aria-label={dayLabel(it.at)}
                  >
                    <div className="h-px flex-1 bg-line" />
                    <span className="text-xs font-medium text-faint">
                      {dayLabel(it.at)}
                    </span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                )}
                {it.kind === "note" ? (
                  <div
                    className={cx(
                      "mx-auto w-full max-w-lg rounded-lg bg-warning-soft px-3 py-2 text-sm",
                      gap,
                    )}
                  >
                    <div className="section-label mb-1 flex items-center gap-1.5 text-xs text-warning">
                      <StickyNote size={11} strokeWidth={1.75} /> Internal note
                      · {it.n.authorId ? memberName(it.n.authorId) : "Reminder"}{" "}
                      · {dateTime(it.n.createdAt)}
                    </div>
                    <div className="whitespace-pre-wrap">{it.n.body}</div>
                  </div>
                ) : (
                  <MessageBubble
                    m={it.m}
                    who={
                      it.m.senderUserId ? memberName(it.m.senderUserId) : null
                    }
                    contactName={contact.name ?? contact.waId}
                    first={first}
                    className={gap}
                  />
                )}
              </Fragment>
            );
          })}
          <div ref={bottom} />
        </div>

        <div className="relative shrink-0 border-t border-line bg-surface p-3">
          {error && (
            <div className="mb-2 flex items-start gap-2">
              <div className="flex-1">
                <Alert tone="danger">{error}</Alert>
              </div>
              <button
                onClick={clearError}
                aria-label="Dismiss"
                className="rounded-md p-1.5 text-muted hover:bg-fill hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {!thread.windowOpen ? (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Lock size={12} strokeWidth={1.75} /> The 24-hour reply window
                is closed. WhatsApp only allows an approved template until the
                customer writes back.
              </p>
              {templates.length === 0 ? (
                <p className="text-sm">
                  No approved templates yet.{" "}
                  <Link className="link" href="/templates/new">
                    Create one
                  </Link>
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    aria-label="Template"
                    className="w-56"
                    value={tplId}
                    onChange={(e) => {
                      setTplId(e.target.value);
                      setVars([]);
                    }}
                  >
                    <option value="">Choose a template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.category.toLowerCase()}
                      </option>
                    ))}
                  </Select>
                  {Array.from({ length: tplVars }).map((_, i) => (
                    <Input
                      key={i}
                      aria-label={`Variable ${i + 1}`}
                      placeholder={`{{${i + 1}}}`}
                      className="w-32"
                      value={vars[i] ?? ""}
                      onChange={(e) =>
                        setVars((v) =>
                          Object.assign([...v], { [i]: e.target.value }),
                        )
                      }
                    />
                  ))}
                  <Button
                    disabled={!tpl || pending}
                    onClick={() =>
                      start(
                        async () =>
                          void (await act(sendTemplateReply(id, tplId, vars))),
                      )
                    }
                  >
                    <Send size={14} strokeWidth={1.75} /> Send template
                  </Button>
                  {tpl && (
                    <p className="w-full pt-1 text-xs text-muted">
                      Preview: {render(tpl.body, vars)}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-4 border-b border-line">
                <button
                  aria-pressed={mode === "reply"}
                  className={tabClass(mode === "reply")}
                  onClick={() => setMode("reply")}
                >
                  Reply
                </button>
                <button
                  aria-pressed={mode === "note"}
                  className={tabClass(mode === "note", "warn")}
                  onClick={() => setMode("note")}
                >
                  Internal note
                </button>
                <button
                  aria-pressed={mode === "media"}
                  className={tabClass(mode === "media")}
                  onClick={() => setMode("media")}
                >
                  <Paperclip size={12} strokeWidth={1.75} /> File
                </button>
              </div>
              {slash.length > 0 && (
                <ul className="absolute inset-x-3 bottom-full mb-1 max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface shadow-menu">
                  {slash.map((r) => (
                    <li key={r.shortcut}>
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-fill"
                        onClick={() => setText(r.body)}
                      >
                        <span className="font-medium">/{r.shortcut}</span>{" "}
                        <span className="text-muted">
                          {r.body.slice(0, 80)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div
                className={cx(
                  "rounded-lg border transition-surface",
                  mode === "note"
                    ? "border-warning bg-warning-soft"
                    : "border-line-strong bg-surface",
                )}
              >
                {mode === "media" && (
                  <div className="flex gap-2 border-b border-line p-2">
                    <Select
                      aria-label="File type"
                      className="w-32 text-13"
                      value={mediaType}
                      onChange={(e) =>
                        setMediaType(e.target.value as typeof mediaType)
                      }
                    >
                      <option value="image">Image</option>
                      <option value="document">Document</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                    </Select>
                    <Input
                      aria-label="Link to file"
                      className="text-13"
                      placeholder="Upload, or paste a public https:// link"
                      value={mediaLink}
                      onChange={(e) => setMediaLink(e.target.value)}
                    />
                    <label className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3 text-13 font-medium transition-surface hover:bg-fill has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                      {uploading ? "Uploading…" : "Upload"}
                      <input
                        type="file"
                        className="sr-only"
                        disabled={uploading}
                        accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,audio/mpeg,audio/ogg,.docx,.xlsx,.pptx,.txt,.csv"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true);
                          const body = new FormData();
                          body.set("file", file);
                          const r = await fetch("/api/files", {
                            method: "POST",
                            body,
                          });
                          const j = (await r.json().catch(() => ({}))) as {
                            url?: string;
                            kind?: typeof mediaType;
                            name?: string;
                            error?: string;
                          };
                          setUploading(false);
                          if (!r.ok || !j.url)
                            return void act(
                              Promise.resolve({
                                ok: false,
                                error: j.error ?? "Upload failed.",
                              }),
                            );
                          setMediaLink(j.url);
                          setFileName(j.name ?? null);
                          if (j.kind) setMediaType(j.kind);
                        }}
                      />
                    </label>
                  </div>
                )}
                <textarea
                  ref={area}
                  data-bare
                  aria-label={mode === "note" ? "Internal note" : "Reply"}
                  className="block min-h-[60px] w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-ink outline-none placeholder:text-placeholder"
                  rows={2}
                  value={text}
                  placeholder={
                    mode === "note"
                      ? "Only your team sees this"
                      : mode === "media"
                        ? "Caption (optional)"
                        : `Message ${contact.name ?? "customer"}`
                  }
                  onChange={(e) => {
                    setText(e.target.value);
                    typingNow =
                      e.target.value.trim().length > 0 && mode !== "note";
                  }}
                  onKeyDown={(e) => {
                    if (matches(e, SHORTCUTS.send)) {
                      e.preventDefault();
                      if ((text.trim() || mode === "media") && !pending)
                        submit();
                    }
                  }}
                />
                <div className="flex items-center gap-3 px-3 pb-3">
                  {!isTouchOnly && (
                    <span className="flex min-w-0 items-center gap-1 truncate text-xs text-faint">
                      Type / for quick replies · <Kbd keys={SHORTCUTS.send} />{" "}
                      to send, <Kbd keys={SHORTCUTS.newLine} /> for a new line
                    </span>
                  )}
                  <span className="ml-auto shrink-0">
                    <Tip
                      label={mode === "note" ? "Add note" : "Send"}
                      keys={SHORTCUTS.send}
                      side="top"
                    >
                      <Button
                        disabled={!canSend}
                        onClick={submit}
                        aria-label={mode === "note" ? "Add note" : "Send"}
                        className="size-9 shrink-0 px-0"
                      >
                        {mode === "note" ? (
                          <StickyNote size={15} strokeWidth={1.75} />
                        ) : (
                          <Send size={15} strokeWidth={1.75} />
                        )}
                      </Button>
                    </Tip>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
      <ContactPanel thread={thread} act={act} />
    </>
  );
}

function MessageBubble({
  m,
  who,
  contactName,
  first,
  className,
}: {
  m: Message;
  who: string | null;
  contactName: string;
  first: boolean;
  className?: string;
}) {
  const out = m.direction === "out";
  const agent = out && m.senderKind === "user";
  // First message of a group carries the sender label: agent name, or Auto-reply for bot/automatic sends.
  const label =
    !first || !out
      ? null
      : agent
        ? who
        : m.senderKind === "campaign"
          ? "Campaign"
          : "Auto-reply";
  const buttons =
    (m.payload?.buttons as string[] | undefined) ??
    (m.payload?.rows as string[] | undefined);
  return (
    <div
      className={cx(
        "flex gap-2",
        out ? "justify-end" : "justify-start",
        className,
      )}
    >
      {!out && (
        <div className="w-6 shrink-0">
          {first && <Avatar name={contactName} size={24} />}
        </div>
      )}
      <div
        className={cx(
          "max-w-[65%] rounded-lg px-3 py-2 text-sm text-ink",
          !out
            ? "border border-line bg-bubble-in"
            : agent
              ? "bg-bubble-agent"
              : "bg-bubble-out",
        )}
      >
        {label && (
          <div
            className={cx(
              "mb-0.5 text-xs font-medium",
              agent ? "text-muted" : "text-accent-text",
            )}
          >
            {label}
          </div>
        )}
        <MediaPreview m={m} />
        <div className="whitespace-pre-wrap break-words">{m.body}</div>
        {buttons && buttons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {buttons.map((b) => (
              <span
                key={b}
                className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium"
              >
                {b}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-xs text-faint tabular-nums">
          {m.type === "template" && <span>template ·</span>}
          {new Date(m.createdAt).toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
          })}
          {out && <Ticks status={m.status} />}
        </div>
        {m.status === "failed" && m.error && (
          <div className="mt-1 text-xs text-danger">{m.error}</div>
        )}
      </div>
    </div>
  );
}

function MediaPreview({ m }: { m: Message }) {
  const inbound = m.payload?.media as
    { id?: string; mimeType?: string } | undefined;
  if (inbound?.id) {
    const src = `/api/media/${m.id}`;
    // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimisable
    if (inbound.mimeType?.startsWith("image/"))
      return (
        <img
          src={src}
          alt="Photo from customer"
          className="mb-1.5 max-h-64 rounded-xs"
        />
      );
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="link mb-1 block text-xs"
      >
        Open attachment
      </a>
    );
  }
  const link = m.payload?.link as string | undefined;
  if (link && m.payload?.mediaType === "image")
    // eslint-disable-next-line @next/next/no-img-element -- external link the agent sent
    return (
      <img src={link} alt="Image sent" className="mb-1.5 max-h-64 rounded-xs" />
    );
  if (link)
    return (
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="link mb-1 block text-xs"
      >
        {String(m.payload?.mediaType)} file
      </a>
    );
  return null;
}

/** Existing lead / order / ticket, shown as a small card above its accordion row. */
function PanelItem({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-line bg-surface px-3 py-2 text-13 transition-surface hover:bg-fill"
    >
      <div className="section-label text-xs text-faint">{label}</div>
      <div className="truncate tabular-nums">{children}</div>
    </Link>
  );
}

/** Accordion row (icon, label, chevron; 44px) that expands to a compact form. Cards for existing items sit above it. */
function PanelSection({
  icon,
  title,
  open,
  onToggle,
  items,
  children,
}: {
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  items?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-line">
      {items && <div className="space-y-1.5 px-4 pt-3">{items}</div>}
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-medium transition-surface hover:bg-fill"
      >
        <span className="text-muted" aria-hidden>
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cx(
            "text-faint transition-transform duration-[120ms] ease-[ease]",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <div
        className={cx(
          "grid transition-[grid-template-rows] duration-[120ms] ease-[ease]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ContactPanel({
  thread,
  act,
}: {
  thread: Thread;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
}) {
  const { conversation: conv, contact } = thread;
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [leadTitle, setLeadTitle] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  // One section open at a time
  const [open, setOpen] = useState<"lead" | "orders" | "ticket" | null>(null);
  const toggle = (k: "lead" | "orders" | "ticket") =>
    setOpen((o) => (o === k ? null : k));
  const money = (o: Thread["orders"][number]) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: o.currency,
      maximumFractionDigits: 0,
    }).format(o.totalMinor / 100);
  return (
    <aside
      className="hidden w-80 shrink-0 overflow-y-auto bg-surface xl:block"
      aria-label="Contact"
    >
      <div className="flex h-16 flex-col justify-center border-b border-line px-4">
        <div className="truncate font-sans text-base font-semibold leading-6">
          {contact.name ?? "Unknown name"}
        </div>
        <div className="text-xs leading-4 text-faint">
          {formatWaId(contact.waId)}
        </div>
      </div>

      <div className="border-b border-line px-4 py-4">
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {contact.optedOutAt && (
            <Badge tone="warning">opted out of offers</Badge>
          )}
          <Badge>source: {contact.source}</Badge>
        </div>
        {thread.ad && (
          <div className="mt-3 rounded-lg border border-line p-3 text-xs">
            <div className="text-muted">
              Came from{" "}
              {thread.ad.sourceType === "post"
                ? "a Facebook or Instagram post"
                : "a Click to WhatsApp ad"}
            </div>
            {thread.ad.sourceUrl?.startsWith("https://") ? (
              <a
                href={thread.ad.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="link mt-0.5 inline-block font-medium"
              >
                {thread.ad.headline ?? "View the ad"}
              </a>
            ) : (
              thread.ad.headline && (
                <div className="font-medium">{thread.ad.headline}</div>
              )
            )}
          </div>
        )}
        <Link
          className="mt-3 inline-flex items-center gap-1.5 text-13 font-medium text-accent-text hover:underline"
          href={`/contacts/${contact.id}`}
        >
          Open contact <ArrowRight size={13} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      <div className="border-b border-line px-4 py-4">
        <SectionLabel as="h3" className="mb-2">
          Labels
        </SectionLabel>
        <div className="flex flex-wrap items-center gap-1">
          {conv.labels.map((l) => (
            <button
              key={l}
              onClick={() =>
                act(
                  setLabels(
                    conv.id,
                    conv.labels.filter((x) => x !== l),
                  ),
                )
              }
              className="rounded-full bg-fill px-2 py-0.5 text-xs font-medium text-muted transition-surface hover:bg-fill-strong hover:line-through"
              title="Remove"
            >
              {l} ×
            </button>
          ))}
          {adding ? (
            <form
              className="w-full"
              onSubmit={(e) => {
                e.preventDefault();
                if (label.trim())
                  act(setLabels(conv.id, [...conv.labels, label])).then(
                    () => (setLabel(""), setAdding(false)),
                  );
              }}
            >
              <Input
                autoFocus
                aria-label="New label"
                className="text-13"
                placeholder="Label, then Enter"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => !label.trim() && setAdding(false)}
                onKeyDown={(e) =>
                  e.key === "Escape" && (setLabel(""), setAdding(false))
                }
              />
            </form>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => setAdding(true)}
            >
              <Plus size={12} strokeWidth={1.75} aria-hidden /> Add
            </Button>
          )}
        </div>
      </div>

      <PanelSection
        icon={<TrendingUp size={15} strokeWidth={1.75} />}
        title="Turn into lead"
        open={open === "lead"}
        onToggle={() => toggle("lead")}
        items={
          thread.leads.length > 0 &&
          thread.leads.map((l) => (
            <PanelItem key={l.id} label="Lead" href="/pipeline">
              {l.title}
            </PanelItem>
          ))
        }
      >
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(convertToLead(conv.id, leadTitle, Number(leadValue) || 0)).then(
              (ok) => ok && (setLeadTitle(""), setLeadValue("")),
            );
          }}
        >
          <Input
            aria-label="Lead title"
            className="text-13"
            placeholder="What do they want?"
            value={leadTitle}
            onChange={(e) => setLeadTitle(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              aria-label="Deal value in rupees"
              className="text-13"
              inputMode="numeric"
              placeholder="Value ₹"
              value={leadValue}
              onChange={(e) => setLeadValue(e.target.value)}
            />
            <Button variant="secondary">Create</Button>
          </div>
        </form>
      </PanelSection>

      <PanelSection
        icon={<Package size={15} strokeWidth={1.75} />}
        title="Orders & bookings"
        open={open === "orders"}
        onToggle={() => toggle("orders")}
        items={
          (thread.appointment || thread.orders.length > 0) && (
            <>
              {thread.appointment && (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-13">
                  <div className="section-label text-xs text-faint">
                    Next visit
                  </div>
                  {thread.appointment.service},{" "}
                  {new Date(thread.appointment.startAt).toLocaleString(
                    "en-IN",
                    {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                </div>
              )}
              {thread.orders.map((o) => (
                <PanelItem key={o.id} label="Order" href={`/orders/${o.id}`}>
                  #{o.number} · {money(o)}{" "}
                  <span className="text-muted">
                    ({o.status}, {o.paymentStatus.replace("_", " ")})
                  </span>
                </PanelItem>
              ))}
            </>
          )
        }
      >
        <ButtonLink
          href={`/orders/new?contact=${contact.id}`}
          size="sm"
          variant="secondary"
          arrow={false}
        >
          <Plus size={12} strokeWidth={1.75} aria-hidden /> New order
        </ButtonLink>
      </PanelSection>

      <PanelSection
        icon={<Ticket size={15} strokeWidth={1.75} />}
        title="Support ticket"
        open={open === "ticket"}
        onToggle={() => toggle("ticket")}
        items={
          thread.tickets.length > 0 &&
          thread.tickets.map((t) => (
            <PanelItem key={t.id} label="Ticket" href={`/tickets/${t.id}`}>
              #{t.number} {t.subject}{" "}
              <span className="text-muted">({t.status})</span>
            </PanelItem>
          ))
        }
      >
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(convertToTicket(conv.id, ticketSubject, priority)).then(
              (ok) => ok && setTicketSubject(""),
            );
          }}
        >
          <Input
            aria-label="Ticket subject"
            className="text-13"
            placeholder="What's the problem?"
            value={ticketSubject}
            onChange={(e) => setTicketSubject(e.target.value)}
          />
          <div className="flex gap-2">
            <Select
              aria-label="Priority"
              className="text-13"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Button variant="secondary">Open</Button>
          </div>
        </form>
      </PanelSection>
    </aside>
  );
}
