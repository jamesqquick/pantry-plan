import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type WorkerEvent = {
  request?: Request;
  respondWith?: (response: Promise<Response>) => void;
  waitUntil?: (work: Promise<unknown>) => void;
};

type WorkerListener = (event: WorkerEvent) => void;

const serviceWorkerSource = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);

function createWorkerRuntime() {
  const listeners = new Map<string, WorkerListener>();
  const cache = {
    match: vi.fn<(request: RequestInfo | URL) => Promise<Response | undefined>>(),
    put: vi
      .fn<(request: RequestInfo | URL, response: Response) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  const caches = {
    delete: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    keys: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
    open: vi.fn<() => Promise<typeof cache>>().mockResolvedValue(cache),
  };
  const fetchMock = vi.fn<typeof fetch>();
  const self = {
    addEventListener: vi.fn((type: string, listener: WorkerListener) => {
      listeners.set(type, listener);
    }),
    clients: { claim: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) },
    location: { origin: "https://pantry-plan.test" },
    skipWaiting: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  runInNewContext(serviceWorkerSource, {
    Error,
    Promise,
    Response,
    URL,
    caches,
    fetch: fetchMock,
    self,
  });

  return { cache, caches, fetchMock, listeners, self };
}

function dispatchExtendableEvent(listener: WorkerListener) {
  let work: Promise<unknown> | undefined;
  listener({
    waitUntil(promise) {
      work = promise;
    },
  });
  if (!work) throw new Error("Expected waitUntil to be called.");
  return work;
}

function dispatchFetch(listener: WorkerListener, request: Request) {
  let response: Promise<Response> | undefined;
  listener({
    request,
    respondWith(promise) {
      response = promise;
    },
  });
  return response;
}

function workerRequest(
  url: string,
  method = "GET",
  mode: RequestMode = "navigate",
) {
  return { method, mode, url } as Request;
}

describe("service worker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("installs only a valid HTML offline fallback", async () => {
    const runtime = createWorkerRuntime();
    runtime.fetchMock.mockResolvedValue(
      new Response("<h1>Offline</h1>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    await dispatchExtendableEvent(runtime.listeners.get("install")!);

    expect(runtime.fetchMock).toHaveBeenCalledWith("/offline.html");
    expect(runtime.caches.open).toHaveBeenCalledWith("pantry-plan-offline-v2");
    expect(runtime.cache.put).toHaveBeenCalledOnce();
    const putCall = runtime.cache.put.mock.calls[0];
    expect(putCall).toBeDefined();
    if (!putCall) throw new Error("Expected the offline response to be cached.");
    expect(putCall[0]).toBe("/offline.html");
    await expect(putCall[1].text()).resolves.toBe("<h1>Offline</h1>");
    expect(runtime.self.skipWaiting).toHaveBeenCalledOnce();
  });

  it.each([
    new Response("Missing", {
      status: 404,
      headers: { "content-type": "text/html" },
    }),
    new Response("Not HTML", {
      headers: { "content-type": "text/plain" },
    }),
  ])("rejects an invalid offline fallback", async (offlineResponse) => {
    const runtime = createWorkerRuntime();
    runtime.fetchMock.mockResolvedValue(offlineResponse);

    await expect(
      dispatchExtendableEvent(runtime.listeners.get("install")!),
    ).rejects.toThrow("Unable to cache the offline fallback.");
    expect(runtime.cache.put).not.toHaveBeenCalled();
    expect(runtime.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("deletes only stale Quick Pantry caches during activation", async () => {
    const runtime = createWorkerRuntime();
    runtime.caches.keys.mockResolvedValue([
      "pantry-plan-offline-v1",
      "pantry-plan-offline-v2",
      "another-app-v1",
    ]);

    await dispatchExtendableEvent(runtime.listeners.get("activate")!);

    expect(runtime.caches.delete).toHaveBeenCalledTimes(1);
    expect(runtime.caches.delete).toHaveBeenCalledWith("pantry-plan-offline-v1");
    expect(runtime.self.clients.claim).toHaveBeenCalledOnce();
  });

  it.each([
    workerRequest("https://pantry-plan.test/recipes", "POST"),
    workerRequest("https://pantry-plan.test/recipes", "GET", "cors"),
    workerRequest("https://pantry-plan.test/api/recipes"),
    workerRequest("https://pantry-plan.test/_actions/recipes.delete"),
    workerRequest("https://pantry-plan.test/mcp"),
    workerRequest("https://other.test/recipes"),
  ])("bypasses non-navigation and private requests", (request) => {
    const runtime = createWorkerRuntime();

    const response = dispatchFetch(runtime.listeners.get("fetch")!, request);

    expect(response).toBeUndefined();
    expect(runtime.fetchMock).not.toHaveBeenCalled();
    expect(runtime.caches.open).not.toHaveBeenCalled();
  });

  it("fetches same-origin navigations without reading or writing runtime caches", async () => {
    const runtime = createWorkerRuntime();
    const networkResponse = new Response("Recipes");
    runtime.fetchMock.mockResolvedValue(networkResponse);
    const request = workerRequest("https://pantry-plan.test/recipes");

    const response = dispatchFetch(runtime.listeners.get("fetch")!, request);

    await expect(response).resolves.toBe(networkResponse);
    expect(runtime.fetchMock).toHaveBeenCalledWith(request, { cache: "no-store" });
    expect(runtime.caches.open).not.toHaveBeenCalled();
    expect(runtime.cache.put).not.toHaveBeenCalled();
  });

  it("returns the cached offline page when navigation fetch fails", async () => {
    const runtime = createWorkerRuntime();
    const offlineResponse = new Response("Offline");
    runtime.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    runtime.cache.match.mockResolvedValue(offlineResponse);
    const request = workerRequest("https://pantry-plan.test/recipes");

    const response = dispatchFetch(runtime.listeners.get("fetch")!, request);

    await expect(response).resolves.toBe(offlineResponse);
    expect(runtime.cache.match).toHaveBeenCalledWith("/offline.html");
  });

  it("returns a plain 503 when no offline page is cached", async () => {
    const runtime = createWorkerRuntime();
    runtime.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    runtime.cache.match.mockResolvedValue(undefined);
    const request = workerRequest("https://pantry-plan.test/recipes");

    const response = await dispatchFetch(runtime.listeners.get("fetch")!, request);

    expect(response?.status).toBe(503);
    expect(response?.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    await expect(response?.text()).resolves.toBe(
      "Quick Pantry is offline. Reconnect and try again.",
    );
  });
});
