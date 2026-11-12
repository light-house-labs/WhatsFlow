/* WhatsFlow service worker: app shell + last inbox list offline, and web push. */
const DEV = new URL(self.location.href).searchParams.has("dev");
const VERSION = "wf-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const PRECACHE = ["/inbox", "/manifest.webmanifest", "/pwa-icon/192"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (DEV) return;
  // Best effort: /inbox needs a session, so a signed-out install just skips it.
  event.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Offline · WhatsFlow</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/24px system-ui,sans-serif;background:#f7f7f8;color:#1b1b1b;text-align:center;padding:24px}@media (prefers-color-scheme:dark){body{background:#222326;color:#e4e4e5}}button{font:inherit;margin-top:16px;height:44px;padding:0 20px;border:0;border-radius:8px;background:#239641;color:#fff}</style>
<div><h1 style="font-size:20px">You're offline</h1><p>WhatsFlow will reconnect when you have signal.</p><button onclick="location.reload()">Try again</button></div>`;

async function networkFirst(request, cacheName, fallback) {
  try {
    const res = await fetch(request);
    // Skip redirects: a signed-out /inbox lands on /login, which mustn't be cached as the inbox.
    if (res.ok && res.type === "basic" && !res.redirected) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    const hit = (await caches.match(request)) ?? (fallback ? await fallback() : undefined);
    if (hit) return hit;
    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(SHELL)).put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (DEV || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Hashed build assets never change: serve from cache.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // The conversation list: always fresh when online, the last copy when not.
  if (url.pathname === "/api/inbox/conversations") {
    event.respondWith(networkFirst(req, DATA));
    return;
  }
  if (req.mode === "navigate") {
    // RSC/prefetch requests carry their own headers and are left to the network.
    event.respondWith(
      networkFirst(req, SHELL, async () => (await caches.match("/inbox")) ?? new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } })),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "WhatsFlow", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/inbox";
  event.waitUntil(
    self.registration.showNotification(data.title || "WhatsFlow", {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/badge",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        // The page routes client-side (keeps its state) when it hears this; see useServiceWorker.
        win.postMessage({ type: "open", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
