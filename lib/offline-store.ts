const DB_NAME = "stonebrae-offline"
const DB_VERSION = 1
const QUEUE = "mutation-queue"
const CACHE = "page-cache"

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
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueueMutation(action: string, payload: unknown) {
  if (typeof window === "undefined") return
  const db = await openDb()
  const mutation: OfflineMutation = { id: crypto.randomUUID(), action, payload, createdAt: Date.now(), attempts: 0 }
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
