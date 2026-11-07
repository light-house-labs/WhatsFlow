"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Alert, Button, Field, Input, Select, cx } from "@/components/ui";

type Msg = { id: string; direction: "in" | "out"; body: string | null; type: string; payload: Record<string, unknown>; createdAt: string; status: string };

export function SandboxPhone({ numbers }: { numbers: { id: string; displayPhone: string; displayName: string }[] }) {
  const [numberId, setNumberId] = useState(numbers[0].id);
  const [from, setFrom] = useState("+91 98765 43210");
  const [name, setName] = useState("Asha Kumar");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const biz = numbers.find((n) => n.id === numberId)!;

  const load = useCallback(async () => {
    const r = await fetch(`/api/sandbox/thread?numberId=${numberId}&from=${encodeURIComponent(from)}`, { cache: "no-store" });
    if (r.ok) setMsgs((await r.json()).messages);
  }, [numberId, from]);

  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  async function send(body: string, replyId?: string) {
    if (!body.trim()) return;
    setError(null);
    const r = await fetch("/api/sandbox/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numberId, from, name, text: body, replyId }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Couldn't send");
    else setText("");
    await load();
  }

  return (
    <div className="flex flex-wrap gap-8 p-6">
      <div className="w-72 space-y-4">
        {numbers.length > 1 && (
          <Field label="Business number" htmlFor="num">
            <Select id="num" value={numberId} onChange={(e) => setNumberId(e.target.value)}>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.displayPhone}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Customer's number" htmlFor="from" hint="Change it to start a chat as a different customer.">
          <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Customer's WhatsApp name" htmlFor="name">
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="space-y-1 text-sm text-muted">
          <p>Try:</p>
          {["hi", "What are your prices?", "STOP"].map((s) => (
            <button key={s} className="mr-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink" onClick={() => send(s)}>
              {s}
            </button>
          ))}
          <p className="pt-2 text-xs">“hi” runs the Welcome menu bot once you set it live in Bot flows.</p>
        </div>
      </div>

      <div className="flex h-[640px] w-[360px] flex-col overflow-hidden rounded-[32px] border-8 border-ink bg-surface-2 shadow-xl" aria-label="Simulated phone">
        <div className="bg-accent px-4 py-3 text-on-accent">
          <div className="text-sm font-semibold">{biz.displayName}</div>
          <div className="text-[11px] opacity-80">{biz.displayPhone} · sandbox</div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {msgs.length === 0 && <p className="mt-10 text-center text-xs text-muted">Say hello to {biz.displayName}.</p>}
          {msgs.map((m) => {
            const mine = m.direction === "in"; // customer's own messages
            const options = (m.payload?.buttons as string[] | undefined) ?? (m.payload?.rows as string[] | undefined) ?? [];
            const prefix = m.payload?.buttons ? "btn" : "row";
            return (
              <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm", mine ? "bg-bubble-out" : "bg-surface")}>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  {!mine && options.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-line pt-2">
                      {options.map((o, i) => (
                        <button key={o} onClick={() => send(o, `${prefix}:${i}`)} className="block w-full rounded py-1 text-center text-xs font-medium text-accent hover:bg-surface-2">
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-0.5 text-right text-[10px] text-muted">
                    {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        {error && (
          <div className="p-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <form
          className="flex gap-2 border-t border-line bg-surface p-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <Input aria-label="Message as customer" placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
          <Button aria-label="Send as customer" disabled={!text.trim()}>
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
