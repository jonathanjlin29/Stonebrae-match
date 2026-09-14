"use client"

import { useEffect, useState } from "react"
import { getActiveOfflineRound } from "@/lib/offline-store"
import { OfflineRoundShell } from "@/components/offline-round-shell"

// The home route's cached HTML shell already renders the normal Dashboard server-side. If the
// user created a round while offline, this swaps that markup for the offline round instead, so
// reopening the app (even from the service worker cache) resumes where they left off.
export function HomeClientGate({
  currentPlayerId,
  children,
}: {
  currentPlayerId: number | null
  children: React.ReactNode
}) {
  const [tempId, setTempId] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    setTempId(getActiveOfflineRound())
    const onUpdate = () => setTempId(getActiveOfflineRound())
    window.addEventListener("offline-round-updated", onUpdate)
    return () => window.removeEventListener("offline-round-updated", onUpdate)
  }, [])

  if (tempId === undefined) return <>{children}</>
  if (tempId != null) return <OfflineRoundShell tempId={tempId} currentPlayerId={currentPlayerId} />
  return <>{children}</>
}
