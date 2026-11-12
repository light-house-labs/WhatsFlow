"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/* ---------- service worker ---------- */

export function useServiceWorker(onOpen: (url: string) => void) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Dev builds get the network-only worker so hot reload never serves a stale chunk.
    const url = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
    navigator.serviceWorker.register(url, { scope: "/" }).catch((e) => console.warn("[sw]", e));
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "open" && typeof e.data.url === "string" && e.data.url.startsWith("/")) onOpen(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [onOpen]);
}

/* ---------- online / offline ---------- */

const onlineSub = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
export function useOnline(): boolean {
  return useSyncExternalStore(onlineSub, () => navigator.onLine, () => true);
}

/* ---------- install prompt ---------- */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());
if (typeof window !== "undefined") {
  // Captured at module load so the event isn't missed before the More screen mounts.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notifyInstall();
  });
}
const installSub = (cb: () => void) => {
  installListeners.add(cb);
  const q = matchMedia("(display-mode: standalone)");
  q.addEventListener("change", cb);
  return () => {
    installListeners.delete(cb);
    q.removeEventListener("change", cb);
  };
};
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const installState = () => (isStandalone() ? "installed" : deferred ? "prompt" : "manual");

/** "prompt": Android/desktop Chrome can show the install dialog. "manual": e.g. iOS, show Add to Home Screen steps. */
export function useInstall() {
  const state = useSyncExternalStore(installSub, installState, () => "installed" as const);
  const prompt = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notifyInstall();
    return outcome === "accepted";
  }, []);
  return { state, prompt };
}

/* ---------- web push ---------- */

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission (must run from a tap), subscribes this device and saves it. Returns an error message or null. */
export async function enablePush(vapidKey: string): Promise<string | null> {
  if (!pushSupported()) return "This browser can't show notifications. On iPhone, add WhatsFlow to your Home Screen first.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Notifications are blocked. Allow them for this site in your browser settings.";
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
  const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return r.ok ? null : "Couldn't turn on notifications. Try again.";
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe();
}

/* ---------- outgoing message retry queue ---------- */

export type Queued = { id: string; conversationId: string; text: string; at: string };
const OUTBOX = "wf:outbox";
const outboxListeners = new Set<() => void>();
let outboxCache: Queued[] | null = null;
function readOutbox(): Queued[] {
  if (outboxCache) return outboxCache;
  try {
    outboxCache = JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as Queued[];
  } catch {
    outboxCache = [];
  }
  return outboxCache;
}
function writeOutbox(list: Queued[]) {
  outboxCache = list;
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(list));
  } catch {}
  outboxListeners.forEach((l) => l());
}
const EMPTY: Queued[] = [];
const outboxSub = (cb: () => void) => {
  outboxListeners.add(cb);
  return () => outboxListeners.delete(cb);
};

export function queueMessage(conversationId: string, text: string) {
  writeOutbox([...readOutbox(), { id: `q${Date.now()}${Math.random().toString(36).slice(2, 6)}`, conversationId, text, at: new Date().toISOString() }]);
}
export function dropQueued(id: string) {
  writeOutbox(readOutbox().filter((q) => q.id !== id));
}
export function useOutbox(conversationId?: string): Queued[] {
  const all = useSyncExternalStore(outboxSub, readOutbox, () => EMPTY);
  return conversationId ? all.filter((q) => q.conversationId === conversationId) : all;
}

let flushing = false;
/** Sends queued messages in order. Stops at the first network failure; a message WhatsApp rejects is dropped and reported. */
export async function flushOutbox(send: (conversationId: string, text: string) => Promise<{ ok: boolean; error?: string }>, onRejected?: (error: string) => void) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const q of [...readOutbox()]) {
      let r: { ok: boolean; error?: string };
      try {
        r = await send(q.conversationId, q.text);
      } catch {
        return; // still offline or the server is unreachable: keep the rest queued
      }
      dropQueued(q.id);
      if (!r.ok) onRejected?.(r.error ?? "A queued message couldn't be sent.");
    }
  } finally {
    flushing = false;
  }
}
