const CACHE_NAME = "pantry-plan-offline-v1";
const OFFLINE_URL = "/offline.html";
const BYPASS_PATHS = ["/_actions/", "/api/", "/mcp"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("pantry-plan-offline-") && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
  );
  self.clients.claim();
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
    fetch(request).catch(() => caches.match(OFFLINE_URL)),
  );
});
