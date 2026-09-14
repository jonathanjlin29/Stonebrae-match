"use client"

import { addPress, completeRound, createRound, saveScore } from "@/app/actions/rounds"
import { createPlayer } from "@/app/actions/players"
import { COURSE } from "@/lib/course"
import { cachePage, enqueueMutation, replayQueuedMutations, resolveId, setActiveOfflineRound } from "@/lib/offline-store"
import type { Match, Player, Round, RoundPlayer, Scores } from "@/lib/types"

// Round/player ids created offline are negative placeholders until the server assigns a real
// id. If a dependent action runs after that id has synced (but before this tab reloads), resolve
// it to the real id so the action can go straight to the server instead of re-queuing needlessly.
async function resolveMaybeTempId(id: number): Promise<number> {
  if (id >= 0) return id
  const resolved = await resolveId(String(id))
  return resolved ?? id
}

export async function createPlayerOffline(input: Parameters<typeof createPlayer>[0]): Promise<Awaited<ReturnType<typeof createPlayer>>> {
  if (navigator.onLine) return createPlayer(input)
  const id = -Date.now()
  const player: Player = {
    id,
    name: input.name.trim(),
    lastName: input.lastName?.trim() || null,
    handicap: Math.round(input.handicap ?? 0),
    nickname: input.nickname?.trim() || null,
    photoUrl: null,
  }
  await enqueueMutation("createPlayer", { ...input, photo: null }, String(id))
  return { ok: true, player }
}

type MatchConfig = {
  type: "singles" | "team"
  teamA: number[]
  teamB: number[]
  nineBet: number
  overallBet: number
}

export async function createRoundOffline(input: {
  playerIds: number[]
  handicaps: Record<number, number>
  matches: MatchConfig[]
  roster: Player[]
  currentPlayerId: number | null
}): Promise<{ ok: true; roundId: number } | { ok: false; error: string }> {
  const payload = { playerIds: input.playerIds, handicaps: input.handicaps, matches: input.matches }
  if (navigator.onLine) return createRound(payload)
  if (input.playerIds.length < 2) return { ok: false, error: "Add at least two players." }

  const tempId = -Date.now()
  const players: RoundPlayer[] = input.playerIds.map((id) => {
    const known = input.roster.find((p) => p.id === id)
    const handicap = Math.round(input.handicaps[id] ?? 0)
    return {
      id,
      name: known?.name ?? "Player",
      lastName: known?.lastName ?? null,
      nickname: known?.nickname ?? null,
      photoUrl: known?.photoUrl ?? null,
      handicap,
      roundHandicap: handicap,
      moneyWon: 0,
    }
  })
  const scores: Scores = {}
  for (const id of input.playerIds) scores[id] = Array(18).fill(null)
  const matches: Match[] = input.matches.map((m, index) => ({
    id: -(Date.now() + index + 1),
    roundId: tempId,
    type: m.type,
    teamA: m.teamA,
    teamB: m.teamB,
    nineBet: m.nineBet,
    overallBet: m.overallBet,
    presses: [],
    results: { front: null, back: null, overall: null, pressResults: {} },
    money: {},
  }))
  const round: Round = {
    id: tempId,
    courseName: COURSE.name,
    holes: COURSE.holes,
    status: "active",
    createdBy: input.currentPlayerId,
    createdAt: new Date().toISOString(),
    completedAt: null,
    players,
    scores,
    matches,
  }

  await cachePage(`round:${tempId}`, round)
  await enqueueMutation("createRound", payload, String(tempId))
  setActiveOfflineRound(tempId)
  return { ok: true, roundId: tempId }
}

export async function saveScoreOffline(roundId: number, playerId: number, hole: number, strokes: number | null) {
  const resolvedRoundId = await resolveMaybeTempId(roundId)
  if (resolvedRoundId >= 0 && navigator.onLine) return saveScore(resolvedRoundId, playerId, hole, strokes)
  await enqueueMutation("saveScore", { roundId: resolvedRoundId, playerId, hole, strokes })
  return { ok: true, queued: true }
}

export async function addPressOffline(roundId: number, matchId: number, scope: "front" | "back", startHole: number, initiatedBy: "A" | "B") {
  const resolvedRoundId = await resolveMaybeTempId(roundId)
  const resolvedMatchId = await resolveMaybeTempId(matchId)
  if (resolvedRoundId >= 0 && resolvedMatchId >= 0 && navigator.onLine) {
    return addPress(resolvedRoundId, resolvedMatchId, scope, startHole, initiatedBy)
  }
  await enqueueMutation("addPress", { roundId: resolvedRoundId, matchId: resolvedMatchId, scope, startHole, initiatedBy })
  return { ok: true, queued: true }
}

export async function completeRoundOffline(roundId: number) {
  const resolvedRoundId = await resolveMaybeTempId(roundId)
  if (resolvedRoundId >= 0 && navigator.onLine) return completeRound(resolvedRoundId)
  await enqueueMutation("completeRound", { roundId: resolvedRoundId })
  return { ok: true, queued: true }
}

export async function syncOfflineChanges() {
  await replayQueuedMutations()
}
