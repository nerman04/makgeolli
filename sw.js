const CACHE_NAME = "makgeolli-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles/main.css?v=5",
  "./js/app.js?v=5",
  "./js/db.js",
  "./js/utils.js",
  "./js/supabase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
  // New versions take over once existing tabs close, preserving unsaved form input.
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
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html")),
    );
    return;
  }
  if (
    !ASSETS.some(
      (asset) => new URL(asset, self.registration.scope).href === url.href,
    )
  )
    return;
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => response || fetch(event.request)),
  );
});
