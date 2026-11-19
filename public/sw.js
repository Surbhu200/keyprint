// Minimal installability Service Worker for Keyprint PWA.
// Never caches API routes, RPC requests, or private storage signed URLs.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass through to network so live onchain state and signed URLs are always fresh.
});
