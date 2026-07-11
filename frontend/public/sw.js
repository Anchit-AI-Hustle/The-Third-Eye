// Service worker for The Third Eye (PWA).
//
// Caching policy is deliberately conservative to avoid version skew after a
// deploy: the app is a Next.js App Router SPA whose JS/RSC chunk filenames are
// content-hashed per build. If the worker ever serves a stale HTML document or
// a stale chunk from a previous deploy, the fresh HTML references chunk hashes
// the cache no longer has and React crashes with a generic client-side
// exception. To prevent that we ONLY cache a small set of immutable static
// assets (icons, manifest, logo) and never intercept HTML navigations, RSC
// payloads, or JS/CSS build chunks — those always go straight to the network.
//
// Bump CACHE_VERSION on any change here so `activate` purges every older cache.
const CACHE_VERSION = "v2";
const CACHE = `thirdeye-${CACHE_VERSION}`;

// Only immutable, non-versioned assets belong in the precache.
const PRECACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png", "/logo.png", "/favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to tell a freshly-installed worker to take over immediately
// (used to recover clients stuck on an old build without a manual unregister).
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (e) => {
  let data = { title: "JARVIS", body: "", url: "/assistant" };
  try { data = { ...data, ...(e.data ? e.data.json() : {}) }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/assistant";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes(url) && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    })
  );
});

// True for static assets we are willing to serve offline. Everything else —
// HTML documents, Next.js data/RSC requests, JS/CSS chunks, API calls — is
// left entirely to the network so the browser always gets the current build.
function isCacheableAsset(url) {
  return /\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(url.pathname) ||
    url.pathname === "/manifest.json";
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Never intercept navigations, API calls, or build chunks — always network.
  if (req.mode === "navigate") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/")) return;
  if (!isCacheableAsset(url)) return;

  // Stale-while-revalidate for immutable static assets only.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
