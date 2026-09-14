"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { clearActiveOfflineRound, readCachedPage, resolveId } from "@/lib/offline-store"
import { RoundScorecard } from "@/components/round-scorecard"
import type { Round } from "@/lib/types"

// Stands in for the real /round/[id] page when a round was created while offline: there's no
// server record yet, so this reads the round straight out of the local cache and swaps to the
// real route automatically once the create finishes syncing and gets a server id.
export function OfflineRoundShell({ tempId, currentPlayerId }: { tempId: number; currentPlayerId: number | null }) {
  const router = useRouter()
  const [round, setRound] = useState<Round | null>(null)

  useEffect(() => {
    let mounted = true
    readCachedPage<Round>(`round:${tempId}`).then((cached) => {
      if (mounted && cached) setRound(cached)
    })
    return () => {
      mounted = false
    }
  }, [tempId])

  useEffect(() => {
    let mounted = true
    async function checkResolved() {
      const serverId = await resolveId(String(tempId))
      if (mounted && serverId != null) {
        clearActiveOfflineRound()
        router.replace(`/round/${serverId}`)
      }
    }
    checkResolved()
    const interval = setInterval(checkResolved, 4000)
    window.addEventListener("online", checkResolved)
    return () => {
      mounted = false
      clearInterval(interval)
      window.removeEventListener("online", checkResolved)
    }
  }, [tempId, router])

  if (!round) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-[var(--color-muted)]">Loading your offline round…</div>
    )
  }

  return <RoundScorecard round={round} currentPlayerId={currentPlayerId} isAdmin={false} />
}
