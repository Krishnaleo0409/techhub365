"use strict";

const CACHE = "kr7tech-availability-v1";
const FALLBACK = "/Unavailable.html";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(FALLBACK, { cache:"reload" }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("kr7tech-availability-") && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache learning pages, account data, API responses or payment requests.
  if (request.method !== "GET" || request.mode !== "navigate" ||
      url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(request, { signal:controller.signal });
      if (response.status < 500) return response;
    } catch {
      // The public fallback is the only stored response.
    } finally {
      clearTimeout(timer);
    }
    let fallback;
    try {
      const cache = await caches.open(CACHE);
      fallback = await cache.match(FALLBACK);
    } catch {
      // Storage can be evicted or disabled after the worker was installed.
    }
    if (fallback) return new Response(await fallback.text(), {
      status:503,
      headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Retry-After":"60" },
    });
    if (response) return response;
    return new Response("KR7Tech is temporarily unavailable. We're working on it. Please try again shortly.", {
      status:503, headers: { "Content-Type":"text/plain; charset=utf-8", "Cache-Control":"no-store" },
    });
  })());
});
