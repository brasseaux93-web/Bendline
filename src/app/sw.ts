import { defaultCache } from "@serwist/next/worker";
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
} from "serwist";

declare global {
  interface Window {
    __SW_MANIFEST?: (PrecacheEntry | string)[];
  }
}

const PAGES_OFFLINE_CACHE = "bendline-pages-v1";

const apiNetworkOnlyRule: RuntimeCaching = {
  matcher: ({ sameOrigin, url: { pathname } }) =>
    sameOrigin && pathname.startsWith("/api/"),
  handler: new NetworkOnly(),
};

const pageNavigationRule: RuntimeCaching = {
  matcher: ({ request, url: { pathname }, sameOrigin }) =>
    sameOrigin &&
    !pathname.startsWith("/api/") &&
    (request.mode === "navigate" || request.destination === "document"),
  handler: new NetworkFirst({
    cacheName: PAGES_OFFLINE_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      {
        requestWillFetch: async ({ request }) =>
          new Request(request.url, {
            headers: { Accept: "text/html" },
            credentials: "same-origin",
          }),
        cacheKeyWillBeUsed: async ({ request }) => {
          const parsedUrl = new URL(request.url);
          return parsedUrl.origin + parsedUrl.pathname;
        },
        handlerDidError: async ({ request }) => {
          const cache = await caches.open(PAGES_OFFLINE_CACHE);
          const parsedUrl = new URL(request.url);
          return (
            (await cache.match(parsedUrl.origin + parsedUrl.pathname)) ??
            (await cache.match("/offline")) ??
            undefined
          );
        },
      },
      new ExpirationPlugin({
        maxEntries: 32,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

const precacheEntries = (self as Window).__SW_MANIFEST;

const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [apiNetworkOnlyRule, pageNavigationRule, ...defaultCache],
});

serwist.addEventListeners();

// Pre-warm offline fallback page inside pages cache on SW install
(
  globalThis as unknown as {
    addEventListener: (
      type: string,
      listener: (ev: { waitUntil: (promise: Promise<unknown>) => void }) => void
    ) => void;
  }
).addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_OFFLINE_CACHE)
      .then((cache) => cache.add("/offline"))
      .catch(() => undefined)
  );
});
