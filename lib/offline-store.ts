const DB_NAME = "stonebrae-offline"
const DB_VERSION = 1
const QUEUE = "mutation-queue"
const CACHE = "page-cache"
const ID_MAP = "id-map"

export type OfflineMutation = {
  id: string
  action: string
  payload: unknown
  createdAt: number
  attempts: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" })
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE)
      if (!db.objectStoreNames.contains(ID_MAP)) db.createObjectStore(ID_MAP)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveIdMapping(tempId: string, serverId: number) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(ID_MAP, "readwrite").objectStore(ID_MAP).put(serverId, tempId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function resolveId(tempId: string): Promise<number | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(ID_MAP).objectStore(ID_MAP).get(tempId)
    request.onsuccess = () => resolve(request.result as number | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueueMutation(action: string, payload: unknown, optimisticId?: string) {
  if (typeof window === "undefined") return
  const db = await openDb()
  const mutation: OfflineMutation = { id: optimisticId ?? crypto.randomUUID(), action, payload, createdAt: Date.now(), attempts: 0 }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(QUEUE, "readwrite").objectStore(QUEUE).add(mutation)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  window.dispatchEvent(new Event("offline-queue-updated"))
}

export async function getQueuedMutations(): Promise<OfflineMutation[]> {
  if (typeof window === "undefined") return []
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE).objectStore(QUEUE).getAll()
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt - b.createdAt))
    request.onerror = () => reject(request.error)
  })
}

// Recursively swaps any negative temporary id (or an object key that looks like one) for the
// real server id once it's known, so a dependent mutation (e.g. saveScore for a round created
// offline) targets the record the server actually created instead of the local placeholder.
async function resolvePayloadIds(value: unknown): Promise<unknown> {
  if (typeof value === "number" && value < 0) {
    const resolved = await resolveId(String(value))
    return resolved ?? value
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolvePayloadIds(item)))
  }
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([key, val]) => {
        let nextKey = key
        if (/^-\d+$/.test(key)) {
          const resolved = await resolveId(key)
          if (resolved != null) nextKey = String(resolved)
        }
        return [nextKey, await resolvePayloadIds(val)] as const
      }),
    )
    return Object.fromEntries(entries)
  }
  return value
}

export async function replayQueuedMutations() {
  if (typeof window === "undefined" || !navigator.onLine) return
  const queued = await getQueuedMutations()
  for (const mutation of queued) {
    const payload = await resolvePayloadIds(mutation.payload)
    const response = await fetch("/api/offline-sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: mutation.action, payload, idempotencyKey: mutation.id }),
    })
    if (!response.ok) break
    const data = await response.json().catch(() => null)
    const result = data?.result
    if (mutation.action === "createPlayer" && result?.ok && result.player?.id != null) {
      await saveIdMapping(mutation.id, result.player.id)
    }
    if (mutation.action === "createRound" && result?.ok && result.roundId != null) {
      await saveIdMapping(mutation.id, result.roundId)
    }
    await removeQueuedMutation(mutation.id)
  }
}

export async function removeQueuedMutation(id: string) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(QUEUE, "readwrite").objectStore(QUEUE).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  window.dispatchEvent(new Event("offline-queue-updated"))
}

export async function cachePage(key: string, value: unknown) {
  if (typeof window === "undefined") return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(CACHE, "readwrite").objectStore(CACHE).put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function readCachedPage<T>(key: string): Promise<T | undefined> {
  if (typeof window === "undefined") return undefined
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(CACHE).objectStore(CACHE).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

// A single flag naming the round created while offline that should take over the home screen
// until it's synced — lets a cached "/" shell resume the right view after a refresh.
const ACTIVE_ROUND_KEY = "stonebrae-active-offline-round"

export function setActiveOfflineRound(tempId: number) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(ACTIVE_ROUND_KEY, String(tempId))
  window.dispatchEvent(new Event("offline-round-updated"))
}

export function getActiveOfflineRound(): number | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(ACTIVE_ROUND_KEY)
  return raw ? Number(raw) : null
}

export function clearActiveOfflineRound() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(ACTIVE_ROUND_KEY)
  window.dispatchEvent(new Event("offline-round-updated"))
}
