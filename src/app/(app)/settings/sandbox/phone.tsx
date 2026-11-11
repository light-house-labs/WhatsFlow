"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Alert, Button, Field, Input, Select, cx } from "@/components/ui";

type Msg = { id: string; direction: "in" | "out"; body: string | null; type: string; payload: Record<string, unknown>; createdAt: string; status: string };

export function SandboxPhone({
  numbers,
  test,
}: {
  numbers: { id: string; displayPhone: string; displayName: string }[];
  /** A flow opened from the builder's Test button. */
  test: { id: string; name: string } | null;
}) {
  const [numberId, setNumberId] = useState(numbers[0].id);
  // tests use their own customer so they don't disturb real sandbox chats
  const [from, setFrom] = useState(test ? "+91 90000 00001" : "+91 98765 43210");
  const [name, setName] = useState(test ? "Test customer" : "Asha Kumar");
  const [testing, setTesting] = useState(Boolean(test));
  const [text, setText] = useState("");
  const [adHeadline, setAdHeadline] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const biz = numbers.find((n) => n.id === numberId)!;

  const load = useCallback(async () => {
    const r = await fetch(`/api/sandbox/thread?numberId=${numberId}&from=${encodeURIComponent(from)}`, { cache: "no-store" });
    if (r.ok) setMsgs((await r.json()).messages);
  }, [numberId, from]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
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
      body: JSON.stringify({ numberId, from, name, text: body, replyId, ...(adHeadline.trim() ? { adHeadline: adHeadline.trim() } : {}), ...(testing && test ? { testFlowId: test.id } : {}) }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Couldn't send");
    else {
      setText("");
      setTesting(false);
      setAdHeadline("");
    }
    await load();
  }

  return (
    <div className="flex flex-wrap gap-8">
      <div className="w-72 space-y-4">
        {test && (
          <Alert tone={testing ? "accent" : "success"}>
            {testing ? (
              <>
                Testing <strong>{test.name}</strong>. Your next message starts it, even if it&apos;s a draft or the keyword doesn&apos;t match.
              </>
            ) : (
              <>
                <strong>{test.name}</strong> is running. Reply to it here.{" "}
                <button className="font-medium underline" onClick={() => setTesting(true)}>
                  Restart test
                </button>{" "}
                ·{" "}
                <Link className="font-medium underline" href={`/bots/${test.id}`}>
                  Back to builder
                </Link>
              </>
            )}
          </Alert>
        )}
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
        <Field label="Came from an ad (optional)" htmlFor="adHeadline" hint="The next message arrives as if the customer tapped a Click to WhatsApp ad with this headline.">
          <Input id="adHeadline" value={adHeadline} maxLength={120} placeholder="Diwali sale: 20% off" onChange={(e) => setAdHeadline(e.target.value)} />
        </Field>
        <div className="space-y-1 text-sm text-muted">
          <p>Try:</p>
          {["hi", "What are your prices?", "STOP"].map((s) => (
            <button key={s} className="mr-1 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink hover:bg-fill" onClick={() => send(s)}>
              {s}
            </button>
          ))}
          <p className="pt-2 text-xs">“hi” runs your starter bot once you set it live in Bot flows.</p>
        </div>
      </div>

      <div className="flex h-[640px] w-[360px] flex-col overflow-hidden rounded-lg border border-line bg-surface" aria-label="Simulated phone">
        <div className="border-b border-line bg-surface px-4 py-3 text-ink">
          <div className="text-sm font-semibold">{biz.displayName}</div>
          <div className="text-xs text-muted">{biz.displayPhone} · sandbox</div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto bg-canvas p-3">
          {msgs.length === 0 && <p className="section-label mt-10 text-center text-faint">Say hello to {biz.displayName}.</p>}
          {msgs.map((m) => {
            const mine = m.direction === "in"; // customer's own messages
            const options = (m.payload?.buttons as string[] | undefined) ?? (m.payload?.rows as string[] | undefined) ?? [];
            const prefix = m.payload?.buttons ? "btn" : "row";
            return (
              <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[80%] rounded-lg px-3 py-2 text-sm", mine ? "bg-bubble-out" : "border border-line bg-bubble-in")}>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  {!mine && options.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-line pt-2">
                      {options.map((o, i) => (
                        <button key={o} onClick={() => send(o, `${prefix}:${i}`)} className="block w-full rounded-xs py-1 text-center text-xs font-medium text-ink hover:bg-surface-2">
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-0.5 text-right text-xs text-muted tabular-nums">
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
