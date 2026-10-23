// Network-first: new deployments no longer require a manual cache-version bump.
const CACHE_NAME = "makgeolli-v5.1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles/main.css?v=5.1",
  "./js/app.js?v=5.1",
  "./js/db.js",
  "./js/utils.js",
  "./js/supabase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const assetPaths = new Set(
  ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname),
);
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Bypass the browser's HTTP cache during installation, too.
      await cache.addAll(
        ASSETS.map(
          (asset) =>
            new Request(new URL(asset, self.registration.scope), {
              cache: "reload",
            }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("makgeolli-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !assetPaths.has(url.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Canonical keys keep navigation/query variations from growing the cache.
      const asset = ASSETS.find(
        (asset) =>
          new URL(asset, self.registration.scope).pathname === url.pathname,
      );
      const cacheKey = new URL(asset, self.registration.scope).href;
      try {
        const response = await fetch(
          new Request(event.request, { cache: "no-cache" }),
        );
        if (response.ok) {
          try {
            await cache.put(cacheKey, response.clone());
          } catch (error) {
            console.warn("Offline cache write failed", error);
          }
        }
        return response;
      } catch (error) {
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
