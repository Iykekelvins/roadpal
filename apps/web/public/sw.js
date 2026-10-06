// RoadPal service worker. Deliberately small, and it NEVER caches API responses or pages:
// a stale offer, price or job status is worse than an honest "you're offline".
//
// It does two things:
//   1. Navigations that fail (no signal) show /offline.html instead of the browser's error page.
//   2. Next's build files (/_next/static/...) are cached: their names contain a content hash, so
//      a cached copy can never be out of date, and the app starts faster on slow networks.

const VERSION = "v2";
const OFFLINE_CACHE = `roadpal-offline-${VERSION}`;
const STATIC_CACHE = `roadpal-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop caches from older versions of this file.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![OFFLINE_CACHE, STATIC_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // map tiles, the API's socket: not ours to handle

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
  // Everything else (including /api/*) goes straight to the network, untouched.
});
