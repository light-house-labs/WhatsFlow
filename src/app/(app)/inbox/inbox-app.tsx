"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, Check, CheckCheck, Clock, Lock, MessageSquare, Paperclip, Search, Send, StickyNote, X } from "lucide-react";
import { Alert, Badge, Button, Input, Select, Textarea, cx } from "@/components/ui";
import { formatWaId } from "@/lib/phone";
import { timeAgo, dateTime, nowMs } from "@/lib/format";
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
type Note = { id: string; body: string; authorId: string | null; createdAt: string };

type Thread = {
  conversation: { id: string; status: string; handledBy: "bot" | "human"; assigneeId: string | null; labels: string[]; lastInboundAt: string | null };
  contact: { id: string; name: string | null; waId: string; tags: string[]; optedOutAt: string | null; source: string; createdAt: string };
  number: { displayPhone: string; provider: string };
  windowOpen: boolean;
  messages: Message[];
  notes: Note[];
  leads: { id: string; title: string }[];
  tickets: { id: string; number: number; subject: string; status: string }[];
  orders: { id: string; number: number; totalMinor: number; currency: string; status: string; paymentStatus: string }[];
  appointment: { startAt: string; service: string } | null;
  viewers: { name: string; typing: boolean }[];
  ad?: { headline: string | null; sourceUrl: string | null; sourceType: string | null } | null;
};

// Whether this browser's agent is mid-reply; sent with each poll for the collision indicator.
let typingNow = false;

const FILTERS = [
  { id: "open", label: "All open" },
  { id: "mine", label: "Mine" },
  { id: "unassigned", label: "Unassigned" },
  { id: "bot", label: "With bot" },
  { id: "closed", label: "Closed" },
];

export function InboxApp({
  me,
  members,
  quickReplies,
  templates,
  initialId,
}: {
  me: string;
  members: Member[];
  quickReplies: QuickReply[];
  templates: Tpl[];
  initialId: string | null;
}) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ListItem[] | null>(null);
  const [waitAlert, setWaitAlert] = useState(15);
  const [selected, setSelected] = useState<string | null>(initialId);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/inbox/conversations?filter=${filter}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setList(j.conversations);
    setWaitAlert(j.waitAlertMinutes);
  }, [filter, q]);

  const loadThread = useCallback(async () => {
    if (!selected) {
      setThread(null);
      return;
    }
    const r = await fetch(`/api/inbox/conversations/${selected}?typing=${typingNow ? 1 : 0}`, { cache: "no-store" });
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
    <div className="flex h-screen">
      {/* list */}
      <section className="flex w-80 shrink-0 flex-col border-r border-line bg-surface" aria-label="Conversations">
        <div className="space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-muted" aria-hidden />
            <Input aria-label="Search conversations" placeholder="Search name, number, message" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cx("rounded-full px-2.5 py-1 text-xs", filter === f.id ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-ink")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list === null && Array.from({ length: 6 }).map((_, i) => <li key={i} className="m-3 h-12 animate-pulse rounded bg-surface-2" />)}
          {list?.length === 0 && (
            <li className="p-6 text-center text-sm text-muted">
              No conversations here yet.
              <br />
              <Link href="/sandbox" className="text-accent">
                Send a test message from the sandbox phone
              </Link>
            </li>
          )}
          {list?.map((c) => {
            const waitingMin = c.waitingSince ? (nowMs() - new Date(c.waitingSince).getTime()) / 60000 : 0;
            const late = c.handledBy === "human" && waitingMin >= waitAlert;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  className={cx("flex w-full gap-3 border-b border-line px-3 py-3 text-left hover:bg-surface-2", selected === c.id && "bg-accent-soft")}
                >
                  <Avatar name={c.contactName ?? c.contactWaId} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cx("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.contactName ?? formatWaId(c.contactWaId)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.handledBy === "bot" && <Bot size={12} className="shrink-0 text-accent" aria-label="Bot is handling" />}
                      <span className="truncate text-xs text-muted">{c.preview}</span>
                      {c.unread > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold text-on-accent">{c.unread}</span>}
                    </div>
                    {(late || c.labels.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {late && (
                          <Badge tone="danger">
                            <Clock size={10} className="mr-1" /> waiting {Math.round(waitingMin)}m
                          </Badge>
                        )}
                        {c.labels.slice(0, 3).map((l) => (
                          <Badge key={l}>{l}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
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
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          <div className="text-center">
            <MessageSquare className="mx-auto mb-2" />
            Pick a conversation
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials || "#"}</div>;
}

function Ticks({ status }: { status: string }) {
  if (status === "failed") return <AlertTriangle size={12} className="text-danger" aria-label="Failed" />;
  if (status === "queued") return <Clock size={12} aria-label="Sending" />;
  if (status === "sent") return <Check size={12} aria-label="Sent" />;
  if (status === "delivered") return <CheckCheck size={12} aria-label="Delivered" />;
  if (status === "read") return <CheckCheck size={12} className="text-accent" aria-label="Read" />;
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
  const { conversation: conv, contact } = thread;
  const id = conv.id;
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note" | "media">("reply");
  const [mediaType, setMediaType] = useState<"image" | "document" | "video" | "audio">("image");
  const [mediaLink, setMediaLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tplId, setTplId] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const memberName = (uid: string | null) => members.find((m) => m.id === uid)?.name ?? "Teammate";

  const items = useMemo(() => {
    const all = [
      ...thread.messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, m })),
      ...thread.notes.map((n) => ({ kind: "note" as const, at: n.createdAt, n })),
    ];
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }, [thread.messages, thread.notes]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  const slash = text.startsWith("/") ? quickReplies.filter((r) => r.shortcut.startsWith(text.slice(1).toLowerCase())) : [];
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

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col bg-bg" aria-label="Conversation">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <Avatar name={contact.name ?? contact.waId} />
          <div className="min-w-0">
            <div className="truncate font-medium">{contact.name ?? formatWaId(contact.waId)}</div>
            <div className="text-xs text-muted">
              {formatWaId(contact.waId)} · via {thread.number.displayPhone}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {thread.viewers.length > 0 && (
              <Badge tone="warning">
                {thread.viewers.map((v) => `${v.name} ${v.typing ? "is replying…" : "is viewing"}`).join(" · ")}
              </Badge>
            )}
            {conv.handledBy === "bot" ? (
              <Button size="sm" variant="secondary" onClick={() => act(takeOver(id))}>
                <Bot size={14} /> Bot is replying · Take over
              </Button>
            ) : (
              <Badge tone="accent">Human</Badge>
            )}
            <Select aria-label="Assignee" className="h-8 w-40 text-[13px]" value={conv.assigneeId ?? ""} onChange={(e) => act(assign(id, e.target.value || null))}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === me ? `${m.name} (me)` : m.name}
                </option>
              ))}
            </Select>
            {conv.status === "closed" ? (
              <Button size="sm" variant="secondary" onClick={() => act(setStatus(id, "open"))}>
                Reopen
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => act(setStatus(id, "closed"))}>
                <Check size={14} /> Close
              </Button>
            )}
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {items.map((it) =>
            it.kind === "note" ? (
              <div key={it.n.id} className="mx-auto max-w-lg rounded-md border border-dashed border-warning bg-surface px-3 py-2 text-sm">
                <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-warning">
                  <StickyNote size={11} /> Internal note · {it.n.authorId ? memberName(it.n.authorId) : "Reminder"} · {dateTime(it.n.createdAt)}
                </div>
                <div className="whitespace-pre-wrap">{it.n.body}</div>
              </div>
            ) : (
              <MessageBubble key={it.m.id} m={it.m} who={it.m.senderUserId ? memberName(it.m.senderUserId) : null} />
            ),
          )}
          <div ref={bottom} />
        </div>

        <div className="border-t border-line bg-surface p-3">
          {error && (
            <div className="mb-2 flex items-start gap-2">
              <div className="flex-1">
                <Alert tone="danger">{error}</Alert>
              </div>
              <button onClick={clearError} aria-label="Dismiss" className="p-1 text-muted">
                <X size={14} />
              </button>
            </div>
          )}
          {!thread.windowOpen ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Lock size={12} /> The 24-hour reply window is closed. WhatsApp only allows an approved template until the customer writes back.
              </p>
              {templates.length === 0 ? (
                <p className="text-sm">
                  No approved templates yet.{" "}
                  <Link className="text-accent" href="/templates/new">
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
                      onChange={(e) => setVars((v) => Object.assign([...v], { [i]: e.target.value }))}
                    />
                  ))}
                  <Button disabled={!tpl || pending} onClick={() => start(async () => void (await act(sendTemplateReply(id, tplId, vars))))}>
                    <Send size={14} /> Send template
                  </Button>
                  {tpl && <p className="w-full text-xs text-muted">Preview: {render(tpl.body, vars)}</p>}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2 flex gap-1 text-xs">
                <button className={cx("rounded px-2 py-1", mode === "reply" ? "bg-accent-soft text-accent" : "text-muted")} onClick={() => setMode("reply")}>
                  Reply
                </button>
                <button className={cx("rounded px-2 py-1", mode === "note" ? "bg-surface-2 text-warning" : "text-muted")} onClick={() => setMode("note")}>
                  Internal note
                </button>
                <button className={cx("inline-flex items-center gap-1 rounded px-2 py-1", mode === "media" ? "bg-accent-soft text-accent" : "text-muted")} onClick={() => setMode("media")}>
                  <Paperclip size={12} /> File
                </button>
                <span className="ml-auto self-center text-muted">Type / for quick replies · Enter to send, Shift+Enter for a new line</span>
              </div>
              {slash.length > 0 && (
                <ul className="mb-2 max-h-40 overflow-y-auto rounded-md border border-line">
                  {slash.map((r) => (
                    <li key={r.shortcut}>
                      <button className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => setText(r.body)}>
                        <span className="font-medium">/{r.shortcut}</span> <span className="text-muted">{r.body.slice(0, 80)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mode === "media" && (
                <div className="mb-2 flex gap-2">
                  <Select aria-label="File type" className="h-9 w-32 text-[13px]" value={mediaType} onChange={(e) => setMediaType(e.target.value as typeof mediaType)}>
                    <option value="image">Image</option>
                    <option value="document">Document</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                  </Select>
                  <Input aria-label="Link to file" className="h-9 text-[13px]" placeholder="Upload, or paste a public https:// link" value={mediaLink} onChange={(e) => setMediaLink(e.target.value)} />
                  <label className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-md border border-line px-3 text-[13px] hover:bg-surface-2">
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
                        const r = await fetch("/api/files", { method: "POST", body });
                        const j = (await r.json().catch(() => ({}))) as { url?: string; kind?: typeof mediaType; name?: string; error?: string };
                        setUploading(false);
                        if (!r.ok || !j.url) return void act(Promise.resolve({ ok: false, error: j.error ?? "Upload failed." }));
                        setMediaLink(j.url);
                        setFileName(j.name ?? null);
                        if (j.kind) setMediaType(j.kind);
                      }}
                    />
                  </label>
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  aria-label={mode === "note" ? "Internal note" : "Reply"}
                  className={cx("min-h-11 flex-1 resize-none", mode === "note" && "border-warning")}
                  rows={2}
                  value={text}
                  placeholder={mode === "note" ? "Only your team sees this" : mode === "media" ? "Caption (optional)" : `Message ${contact.name ?? "customer"}`}
                  onChange={(e) => {
                    setText(e.target.value);
                    typingNow = e.target.value.trim().length > 0 && mode !== "note";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if ((text.trim() || mode === "media") && !pending) submit();
                    }
                  }}
                />
                <Button disabled={(mode === "media" ? !mediaLink.trim() : !text.trim()) || pending} onClick={submit} aria-label={mode === "note" ? "Add note" : "Send"}>
                  {mode === "note" ? <StickyNote size={16} /> : <Send size={16} />}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
      <ContactPanel thread={thread} act={act} />
    </>
  );
}

function MessageBubble({ m, who }: { m: Message; who: string | null }) {
  const out = m.direction === "out";
  const label = out ? (m.senderKind === "user" ? who : m.senderKind === "bot" ? "Bot" : m.senderKind === "campaign" ? "Campaign" : "Auto-reply") : null;
  const buttons = (m.payload?.buttons as string[] | undefined) ?? (m.payload?.rows as string[] | undefined);
  return (
    <div className={cx("flex", out ? "justify-end" : "justify-start")}>
      <div className={cx("max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm", out ? "bg-bubble-out" : "bg-bubble-in")}>
        {label && <div className="mb-0.5 text-[11px] font-medium text-accent">{label}</div>}
        <MediaPreview m={m} />
        <div className="whitespace-pre-wrap break-words">{m.body}</div>
        {buttons && buttons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {buttons.map((b) => (
              <span key={b} className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-accent">
                {b}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
          {m.type === "template" && <span>template ·</span>}
          {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
          {out && <Ticks status={m.status} />}
        </div>
        {m.status === "failed" && m.error && <div className="mt-1 text-[11px] text-danger">{m.error}</div>}
      </div>
    </div>
  );
}

function MediaPreview({ m }: { m: Message }) {
  const inbound = m.payload?.media as { id?: string; mimeType?: string } | undefined;
  if (inbound?.id) {
    const src = `/api/media/${m.id}`;
    // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimisable
    if (inbound.mimeType?.startsWith("image/")) return <img src={src} alt="Photo from customer" className="mb-1 max-h-64 rounded" />;
    return (
      <a href={src} target="_blank" rel="noreferrer" className="mb-1 block text-xs text-accent underline">
        Open attachment
      </a>
    );
  }
  const link = m.payload?.link as string | undefined;
  if (link && m.payload?.mediaType === "image")
    // eslint-disable-next-line @next/next/no-img-element -- external link the agent sent
    return <img src={link} alt="Image sent" className="mb-1 max-h-64 rounded" />;
  if (link)
    return (
      <a href={link} target="_blank" rel="noreferrer" className="mb-1 block text-xs text-accent underline">
        {String(m.payload?.mediaType)} file
      </a>
    );
  return null;
}

function ContactPanel({ thread, act }: { thread: Thread; act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean> }) {
  const { conversation: conv, contact } = thread;
  const [label, setLabel] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  return (
    <aside className="hidden w-72 shrink-0 space-y-5 overflow-y-auto border-l border-line bg-surface p-4 xl:block" aria-label="Contact">
      <div>
        <div className="text-sm font-semibold">{contact.name ?? "Unknown name"}</div>
        <div className="text-xs text-muted">{formatWaId(contact.waId)}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {contact.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {contact.optedOutAt && <Badge tone="warning">opted out of offers</Badge>}
          <Badge>source: {contact.source}</Badge>
        </div>
        {thread.ad && (
          <div className="mt-2 rounded-md bg-surface-2 p-2 text-xs">
            <div className="text-muted">Came from {thread.ad.sourceType === "post" ? "a Facebook or Instagram post" : "a Click to WhatsApp ad"}</div>
            {thread.ad.sourceUrl?.startsWith("https://") ? (
              <a href={thread.ad.sourceUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-accent">
                {thread.ad.headline ?? "View the ad"}
              </a>
            ) : (
              thread.ad.headline && <div className="font-medium">{thread.ad.headline}</div>
            )}
          </div>
        )}
        <Link className="mt-2 inline-block text-xs text-accent" href={`/contacts/${contact.id}`}>
          Open contact →
        </Link>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Labels</h3>
        <div className="flex flex-wrap gap-1">
          {conv.labels.map((l) => (
            <button key={l} onClick={() => act(setLabels(conv.id, conv.labels.filter((x) => x !== l)))} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs hover:line-through" title="Remove">
              {l} ×
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) act(setLabels(conv.id, [...conv.labels, label])).then(() => setLabel(""));
          }}
        >
          <Input aria-label="New label" className="h-8 text-[13px]" placeholder="Add label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button size="sm" variant="secondary">
            Add
          </Button>
        </form>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Turn into a lead</h3>
        {thread.leads.map((l) => (
          <Link key={l.id} href="/pipeline" className="block text-sm text-accent">
            • {l.title}
          </Link>
        ))}
        <form
          className="mt-1 space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            act(convertToLead(conv.id, leadTitle, Number(leadValue) || 0)).then((ok) => ok && (setLeadTitle(""), setLeadValue("")));
          }}
        >
          <Input aria-label="Lead title" className="h-8 text-[13px]" placeholder="What do they want?" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} />
          <div className="flex gap-1">
            <Input aria-label="Deal value in rupees" className="h-8 text-[13px]" inputMode="numeric" placeholder="Value ₹" value={leadValue} onChange={(e) => setLeadValue(e.target.value)} />
            <Button size="sm" variant="secondary">
              Create
            </Button>
          </div>
        </form>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Orders & bookings</h3>
        {thread.appointment && (
          <p className="mb-1 text-sm">
            Next visit: {thread.appointment.service}, {new Date(thread.appointment.startAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
        {thread.orders.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="block text-sm text-accent">
            #{o.number} · {new Intl.NumberFormat("en-IN", { style: "currency", currency: o.currency, maximumFractionDigits: 0 }).format(o.totalMinor / 100)}{" "}
            <span className="text-muted">
              ({o.status}, {o.paymentStatus.replace("_", " ")})
            </span>
          </Link>
        ))}
        <Link href={`/orders/new?contact=${contact.id}`} className="mt-1 inline-block text-sm font-medium text-accent">
          + New order
        </Link>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Support ticket</h3>
        {thread.tickets.map((t) => (
          <Link key={t.id} href={`/tickets/${t.id}`} className="block text-sm text-accent">
            #{t.number} {t.subject} <span className="text-muted">({t.status})</span>
          </Link>
        ))}
        <form
          className="mt-1 space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            act(convertToTicket(conv.id, ticketSubject, priority)).then((ok) => ok && setTicketSubject(""));
          }}
        >
          <Input aria-label="Ticket subject" className="h-8 text-[13px]" placeholder="What's the problem?" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} />
          <div className="flex gap-1">
            <Select aria-label="Priority" className="h-8 text-[13px]" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Button size="sm" variant="secondary">
              Open
            </Button>
          </div>
        </form>
      </div>
    </aside>
  );
}
