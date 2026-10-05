const DB_NAME = "stonebrae-offline"
const DB_VERSION = 1
const QUEUE = "mutation-queue"
const CACHE = "page-cache"
const ID_MAP = "id-map"
const MAX_SERVER_ATTEMPTS = 5

export type OfflineMutation = {
  id: string
  action: string
  payload: unknown
  createdAt: number
  attempts: number
  // Mutations sharing a dedupeKey (e.g. the same score cell) collapse into one queue entry so
  // only the latest value is uploaded. `version` bumps on each collapse so a replay that was
  // already uploading the older value doesn't delete the newer one when it finishes.
  dedupeKey?: string
  version?: number
}

// A single shared connection keeps IndexedDB transactions in the exact order they were
// requested, which is what makes rapid back-to-back edits of the same cell land correctly.
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"))
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" })
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE)
      if (!db.objectStoreNames.contains(ID_MAP)) db.createObjectStore(ID_MAP)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onclose = () => {
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })
  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveIdMapping(tempId: string, serverId: number) {
  const db = await openDb()
  await requestToPromise(db.transaction(ID_MAP, "readwrite").objectStore(ID_MAP).put(serverId, tempId))
}

export async function resolveId(tempId: string): Promise<number | undefined> {
  try {
    const db = await openDb()
    return (await requestToPromise(db.transaction(ID_MAP).objectStore(ID_MAP).get(tempId))) as number | undefined
  } catch {
    return undefined
  }
}

function notifyQueueChanged() {
  window.dispatchEvent(new Event("offline-queue-updated"))
}

export async function enqueueMutation(action: string, payload: unknown, optimisticId?: string, dedupeKey?: string) {
  if (typeof window === "undefined") return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, "readwrite")
    const store = tx.objectStore(QUEUE)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)

    const fresh: OfflineMutation = {
      id: optimisticId ?? crypto.randomUUID(),
      action,
      payload,
      createdAt: Date.now(),
      attempts: 0,
      dedupeKey,
      version: 1,
    }

    if (!dedupeKey) {
      store.put(fresh)
      return
    }
    const all = store.getAll()
    all.onsuccess = () => {
      const existing = (all.result as OfflineMutation[]).find((m) => m.dedupeKey === dedupeKey)
      if (existing) {
        store.put({ ...existing, payload, attempts: 0, version: (existing.version ?? 1) + 1 })
      } else {
        store.put(fresh)
      }
    }
  })
  notifyQueueChanged()
}

export async function getQueuedMutations(): Promise<OfflineMutation[]> {
  if (typeof window === "undefined") return []
  try {
    const db = await openDb()
    const items = (await requestToPromise(db.transaction(QUEUE).objectStore(QUEUE).getAll())) as OfflineMutation[]
    return items.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
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

// Removes a mutation only if it hasn't been superseded (collapsed with a newer value) while it
// was uploading — otherwise the newer value stays queued for the next pass.
async function settleMutation(id: string, version: number | undefined, outcome: "done" | "failed") {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, "readwrite")
    const store = tx.objectStore(QUEUE)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const get = store.get(id)
    get.onsuccess = () => {
      const current = get.result as OfflineMutation | undefined
      if (!current) return
      if ((current.version ?? 1) !== (version ?? 1)) return
      if (outcome === "done") {
        store.delete(id)
        return
      }
      const attempts = current.attempts + 1
      if (attempts >= MAX_SERVER_ATTEMPTS) {
        console.error("[offline] Dropping mutation after repeated server failures", current.action, current.payload)
        store.delete(id)
      } else {
        store.put({ ...current, attempts })
      }
    }
  })
  notifyQueueChanged()
}

let replayInFlight: Promise<void> | null = null
let replayAgain = false

// Uploads queued changes strictly one at a time, in order. Only one replay ever runs; a call
// that arrives mid-replay just schedules one more pass so nothing gets uploaded twice or out of
// order.
export function replayQueuedMutations(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (replayInFlight) {
    replayAgain = true
    return replayInFlight
  }
  replayInFlight = (async () => {
    let syncedAny = false
    try {
      do {
        replayAgain = false
        if (!navigator.onLine) break
        const queued = await getQueuedMutations()
        for (const mutation of queued) {
          const payload = await resolvePayloadIds(mutation.payload)
          let response: Response
          try {
            response = await fetch("/api/offline-sync", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: mutation.action, payload, idempotencyKey: mutation.id }),
            })
          } catch {
            // No connection (even if the browser claims to be online). Keep everything queued.
            return
          }
          if (!response.ok) {
            await settleMutation(mutation.id, mutation.version, "failed")
            if (response.status >= 500 || response.status === 409) return
            continue
          }
          const data = await response.json().catch(() => null)
          const result = data?.result
          if (mutation.action === "createPlayer" && result?.ok && result.player?.id != null) {
            await saveIdMapping(mutation.id, result.player.id)
          }
          if (mutation.action === "createRound" && result?.ok && result.roundId != null) {
            await saveIdMapping(mutation.id, result.roundId)
          }
          await settleMutation(mutation.id, mutation.version, "done")
          syncedAny = true
        }
      } while (replayAgain)
    } catch (error) {
      console.error("[offline] Replay failed", error)
    } finally {
      replayInFlight = null
      if (syncedAny) window.dispatchEvent(new Event("offline-synced"))
    }
  })()
  return replayInFlight
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleSync(delay = 700) {
  if (typeof window === "undefined") return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void replayQueuedMutations()
  }, delay)
}

export async function removeQueuedMutation(id: string) {
  const db = await openDb()
  await requestToPromise(db.transaction(QUEUE, "readwrite").objectStore(QUEUE).delete(id))
  notifyQueueChanged()
}

export async function cachePage(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    const db = await openDb()
    await requestToPromise(db.transaction(CACHE, "readwrite").objectStore(CACHE).put(value, key))
  } catch {
    // Caching is best-effort; never let it break the UI.
  }
}

export async function readCachedPage<T>(key: string): Promise<T | undefined> {
  if (typeof window === "undefined") return undefined
  try {
    const db = await openDb()
    return (await requestToPromise(db.transaction(CACHE).objectStore(CACHE).get(key))) as T | undefined
  } catch {
    return undefined
  }
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
