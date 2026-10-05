"use client"

import { useEffect } from "react"
import { OfflineStatus } from "@/components/offline-status"
import { syncOfflineChanges } from "@/lib/offline-actions"

export function OfflineProvider() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
    }
    const sync = () => {
      syncOfflineChanges().catch(() => undefined)
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") sync()
    }
    // A lost or hung request can't always be caught by the "online" event (the phone may think
    // it's connected the whole time), so retry any queued changes on a gentle interval too.
    const interval = setInterval(sync, 15 * 1000)
    // Last line of defense: a failed background request should never take the whole app down.
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = String(event.reason?.message ?? event.reason ?? "")
      if (/fetch|network|load failed|offline/i.test(message)) event.preventDefault()
    }
    window.addEventListener("online", sync)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("unhandledrejection", onRejection)
    sync()
    return () => {
      clearInterval(interval)
      window.removeEventListener("online", sync)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return <OfflineStatus />
}
