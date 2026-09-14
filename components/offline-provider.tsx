"use client"

import { useEffect } from "react"
import { OfflineStatus } from "@/components/offline-status"
import { syncOfflineChanges } from "@/lib/offline-actions"

export function OfflineProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
    const sync = () => { void syncOfflineChanges() }
    window.addEventListener("online", sync)
    sync()
    return () => window.removeEventListener("online", sync)
  }, [])

  return <OfflineStatus />
}
