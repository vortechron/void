/// <reference lib="webworker" />

// Minimal service worker for installability.
//
// It deliberately does NOT cache hashed build assets. The app is useless
// without its backend, so a full offline cache would only buy staleness. The
// one thing kept is the app shell, so an installed window still paints
// something instead of the browser's offline error page, and so the
// install criteria that require a start_url response while offline are met.
//
// Navigations are network-first: a fresh index.html always wins when the
// network answers, and the cached copy is refreshed on every success. Every
// other request passes straight through without interception.

const SHELL_CACHE_PREFIX = "t3code-shell-";
const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}v1`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE_NAME)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: "reload" })))
      // A failed precache must not block activation; the fetch handler
      // repopulates the cache on the first successful navigation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(SHELL_CACHE_NAME)
              .then((cache) => cache.put(SHELL_URL, copy))
              .catch(() => undefined),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(SHELL_URL, { cacheName: SHELL_CACHE_NAME })
          .then(
            (cached) => cached ?? new Response("Offline", { status: 503, statusText: "Offline" }),
          ),
      ),
  );
});
