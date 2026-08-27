const CACHE_NAME = "pantry-plan-offline-v2";
const OFFLINE_URL = "/offline.html";
const BYPASS_PATHS = ["/_actions/", "/api/", "/mcp"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(async (cache) => {
        const response = await fetch(OFFLINE_URL);

        // Cloudflare serves offline.html at /offline. Strip that redirect so the
        // cached response can be used directly when the network is unavailable.
        await cache.put(
          OFFLINE_URL,
          new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
        );
      }),
      self.skipWaiting(),
    ]),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter(
                (cacheName) =>
                  cacheName.startsWith("pantry-plan-offline-") &&
                  cacheName !== CACHE_NAME,
              )
              .map((cacheName) => caches.delete(cacheName)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    BYPASS_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(path))
  ) {
    return;
  }

  event.respondWith(
    fetch(request, { cache: "no-store" }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const offlineResponse = await cache.match(OFFLINE_URL);

      return (
        offlineResponse ??
        new Response("Pantry Plan is offline. Reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});
