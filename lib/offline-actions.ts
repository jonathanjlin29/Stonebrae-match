"use client"

import { addPress, completeRound, saveScore } from "@/app/actions/rounds"
import { enqueueMutation, replayQueuedMutations } from "@/lib/offline-store"

export async function saveScoreOffline(roundId: number, playerId: number, hole: number, strokes: number | null) {
  if (navigator.onLine) return saveScore(roundId, playerId, hole, strokes)
  await enqueueMutation("saveScore", { roundId, playerId, hole, strokes })
  return { ok: true, queued: true }
}

export async function addPressOffline(roundId: number, matchId: number, scope: "front" | "back", startHole: number, initiatedBy: "A" | "B") {
  if (navigator.onLine) return addPress(roundId, matchId, scope, startHole, initiatedBy)
  await enqueueMutation("addPress", { roundId, matchId, scope, startHole, initiatedBy })
  return { ok: true, queued: true }
}

export async function completeRoundOffline(roundId: number) {
  if (navigator.onLine) return completeRound(roundId)
  await enqueueMutation("completeRound", { roundId })
  return { ok: true, queued: true }
}

export async function syncOfflineChanges() {
  await replayQueuedMutations()
}
