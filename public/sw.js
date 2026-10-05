const CACHE_NAME = "stonebrae-shell-v2"
const OFFLINE_URL = "/offline"
// Spotty cell coverage on the course often means a request that hangs rather than fails. Fall
// back to the cached copy after this long instead of leaving the screen blank.
const NETWORK_TIMEOUT_MS = 4000

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL, "/"]))
      .catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function putInCache(request, response) {
  if (!response || !response.ok || response.type === "opaque") return
  const copy = response.clone()
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => undefined)
}

async function networkFirst(request, fallbackToShell) {
  const network = fetch(request).then((response) => {
    putInCache(request, response)
    return response
  })
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ])
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (fallbackToShell) {
      const shell = (await caches.match(request.url.split("?")[0])) || (await caches.match(OFFLINE_URL))
      if (shell) return shell
    }
    // Nothing cached: keep waiting on the real network in case it was just slow.
    return network.catch(() => Response.error())
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  const network = fetch(request)
    .then((response) => {
      putInCache(request, response)
      return response
    })
    .catch(() => null)
  if (cached) return cached
  const response = await network
  return response || Response.error()
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, true))
    return
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|mp4)$/.test(url.pathname)
  if (isStaticAsset) {
    event.respondWith(cacheFirst(request))
    return
  }

  // RSC payloads, API reads, and everything else: fresh data first, cached copy when offline.
  event.respondWith(networkFirst(request, false))
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})
