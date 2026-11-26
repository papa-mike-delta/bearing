import { lockAccount } from "/bearing-outbox.js";
const CACHE = "bearing-offline-ef6b78fe4eb3";
const ASSETS = [
  "/offline.html",
  "/bearing-offline.css",
  "/bearing-offline.js",
  "/bearing-outbox.js",
  "/logo.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("bearing-offline-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Switching sessions locks the previous account's local context in every controlled tab.
  if (
    event.request.method === "POST" &&
    ["/api/auth/login", "/api/auth/register", "/api/auth/logout"].includes(
      url.pathname,
    )
  ) {
    event.respondWith(
      (async () => {
        const response = await fetch(event.request);
        if (response.ok) await lockAccount();
        return response;
      })(),
    );
    return;
  }
  if (event.request.method !== "GET") return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(url.pathname)) || fetch(event.request),
        ),
    );
    return;
  }
  if (
    event.request.mode === "navigate" &&
    (url.pathname === "/app" || url.pathname.startsWith("/app/"))
  )
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
  // Never cache authenticated HTML, RSC, API data, search results or session responses.
});
