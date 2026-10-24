/* FORGE Field service worker (generated at build time by vite-plugins/fieldServiceWorker.js).
 * Keeps the app shell and the field app's code on the device so /field opens
 * with no connection. Data is not cached here: the field app keeps its own
 * records in IndexedDB, and Firestore traffic is never intercepted. */

const VERSION = "__VERSION__";
const PRECACHE = "forge-field-" + VERSION;
const RUNTIME = "forge-field-runtime";
// Map tiles and pre-fire plan files viewed online, kept for offline use.
const EXTERNAL = "forge-field-external";
const EXTERNAL_MAX_ENTRIES = 1200;
const PRECACHE_URLS = __PRECACHE_URLS__;
const SHELL_URL = "/index.html";
const RUNTIME_MAX_ENTRIES = 250;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("forge-field-") && name !== PRECACHE && name !== RUNTIME && name !== EXTERNAL)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isFieldPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return (parts.length === 1 && parts[0] === "field") || (parts.length === 2 && parts[1] === "field");
}

async function trimRuntime() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - RUNTIME_MAX_ENTRIES).map((key) => cache.delete(key)));
}

async function trimExternal() {
  const cache = await caches.open(EXTERNAL);
  const keys = await cache.keys();
  if (keys.length <= EXTERNAL_MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - EXTERNAL_MAX_ENTRIES).map((key) => cache.delete(key)));
}

/** Map tiles and stored files: the saved copy first, otherwise the network (and keep a copy). */
async function handleExternal(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    const copy = response.clone();
    caches.open(EXTERNAL).then((cache) => cache.put(request, copy)).then(trimExternal).catch(() => null);
  }
  return response;
}

function isExternalCacheable(url) {
  if (url.hostname === "server.arcgisonline.com") return true;
  return url.hostname === "firebasestorage.googleapis.com" && url.searchParams.get("alt") === "media";
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

/** Pages: try the network (fresh deploys win), fall back to the stored app shell. */
async function handleNavigation(request) {
  const url = new URL(request.url);
  const field = isFieldPath(url.pathname);
  try {
    const network = fetch(request);
    const response = await (field ? Promise.race([network, timeout(3500)]) : network);
    if (response && response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
      const copy = response.clone();
      caches.open(PRECACHE).then((cache) => cache.put(SHELL_URL, copy)).catch(() => null);
    }
    return response;
  } catch {
    const cached = await caches.match(SHELL_URL, { ignoreVary: true });
    if (cached) return cached;
    return new Response("<h1>Offline</h1><p>Open FORGE Field once with a connection.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

/** Built files have content hashes in their names: the stored copy is always right. */
async function handleAsset(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(RUNTIME).then((cache) => cache.put(request, copy)).then(trimRuntime).catch(() => null);
  }
  return response;
}

/** Other same-site files (logos, manifest): stored copy now, refreshed in the background. */
async function handleStatic(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await caches.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => null);
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  return response || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (isExternalCacheable(url)) event.respondWith(handleExternal(request));
    return; // Firestore, Auth, fonts: untouched
  }
  if (url.pathname.startsWith("/__/") || url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(handleAsset(request));
    return;
  }
  // Small static files only (logos, icons, manifest, hydrant JSON); documents
  // and downloads go straight to the network.
  if (/\.(png|jpe?g|svg|webp|ico|json|webmanifest|woff2?)$/i.test(url.pathname)) {
    event.respondWith(handleStatic(request));
  }
});
