"use client"

import { useEffect } from "react"
import { OfflineStatus } from "@/components/offline-status"

export function OfflineProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
  }, [])

  return <OfflineStatus />
}
