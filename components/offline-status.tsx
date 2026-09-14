"use client"

import { useEffect, useState } from "react"
import { getQueuedMutations } from "@/lib/offline-store"

export function OfflineStatus() {
  const [online, setOnline] = useState(true)
  const [queued, setQueued] = useState(0)

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine)
      getQueuedMutations().then((items) => setQueued(items.length)).catch(() => setQueued(0))
    }
    refresh()
    window.addEventListener("online", refresh)
    window.addEventListener("offline", refresh)
    window.addEventListener("offline-queue-updated", refresh)
    return () => {
      window.removeEventListener("online", refresh)
      window.removeEventListener("offline", refresh)
      window.removeEventListener("offline-queue-updated", refresh)
    }
  }, [])

  if (online && queued === 0) return null
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs shadow-xl sm:inset-x-auto sm:right-4 sm:w-auto">
      <span className="font-semibold text-[var(--color-foreground)]">{online ? "Sync pending" : "Offline mode"}</span>
      <span className="text-[var(--color-muted)]">{queued ? `${queued} change${queued === 1 ? "" : "s"} queued` : "Cached data available"}</span>
    </div>
  )
}
