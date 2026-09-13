"use server"

import { sql } from "@/lib/db"
import { COURSE } from "@/lib/course"
import { isBounceBack } from "@/lib/nassau"
import type { PlayerAnalytics } from "@/lib/nassau"
import { getPlayers } from "./players"

export type LeaderboardEntry = {
  id: number
  name: string
  lastName: string | null
  nickname: string | null
  photoUrl: string | null
  totalMoney: number
  roundsPlayed: number
  bestRound: number
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const rows = await sql`
    SELECT p.id, p.name, p.last_name,
      COALESCE(SUM(rp.money_won), 0) AS total_money,
      COUNT(rp.id) AS rounds_played,
      COALESCE(MAX(rp.money_won), 0) AS best_round
    FROM players p
    LEFT JOIN round_players rp ON rp.player_id = p.id
    LEFT JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    GROUP BY p.id, p.name, p.last_name
    ORDER BY total_money DESC, rounds_played DESC`
  const profiles = new Map((await getPlayers()).map((player) => [player.id, player]))
  return rows
    .map((r: any) => ({
      id: r.id,
      name: r.name,
      lastName: r.last_name,
      nickname: profiles.get(r.id)?.nickname ?? null,
      photoUrl: profiles.get(r.id)?.photoUrl ?? null,
      totalMoney: Number(r.total_money),
      roundsPlayed: Number(r.rounds_played),
      bestRound: Number(r.best_round),
    }))
}

export async function getPlayerAnalytics(playerId: number): Promise<PlayerAnalytics> {
  // Completed rounds this player took part in.
  const scoreRows = await sql`
    SELECT s.round_id, s.hole, s.strokes
    FROM scores s
    JOIN rounds r ON r.id = s.round_id
    WHERE s.player_id = ${playerId} AND r.status = 'completed'
    ORDER BY s.round_id ASC, s.hole ASC`

  const byRound: Record<number, (number | null)[]> = {}
  for (const row of scoreRows) {
    if (!byRound[row.round_id]) byRound[row.round_id] = Array(18).fill(null)
    byRound[row.round_id][row.hole] = row.strokes
  }

  let frontTotal = 0
  let frontHoles = 0
  let frontParTotal = 0
  let backTotal = 0
  let backHoles = 0
  let backParTotal = 0
  let bounceBackOpportunities = 0
  let bounceBacks = 0
  let fireHotStreaks = 0
  let longestBirdieStreak = 0

  for (const holes of Object.values(byRound)) {
    // nine splits
    for (let h = 0; h < 18; h++) {
      const s = holes[h]
      if (s == null) continue
      const par = COURSE.holes[h].par
      if (h < 9) {
        frontTotal += s
        frontParTotal += par
        frontHoles++
      } else {
        backTotal += s
        backParTotal += par
        backHoles++
      }
    }

    // bounce backs: opportunity = a bogey-or-worse followed by an entered hole
    for (let h = 1; h < 18; h++) {
      const prev = holes[h - 1]
      const cur = holes[h]
      if (prev == null || cur == null) continue
      if (prev - COURSE.holes[h - 1].par >= 1) {
        bounceBackOpportunities++
        if (isBounceBack(holes, h)) bounceBacks++
      }
    }

    // fire hot: streaks of 2+ consecutive birdies-or-better
    let streak = 0
    for (let h = 0; h < 18; h++) {
      const s = holes[h]
      if (s != null && s - COURSE.holes[h].par <= -1) {
        streak++
      } else {
        if (streak >= 2) fireHotStreaks++
        longestBirdieStreak = Math.max(longestBirdieStreak, streak)
        streak = 0
      }
    }
    if (streak >= 2) fireHotStreaks++
    longestBirdieStreak = Math.max(longestBirdieStreak, streak)
  }

  // Money + press record
  const moneyRows = await sql`
    SELECT COALESCE(SUM(rp.money_won),0) AS total, COUNT(*) AS rounds
    FROM round_players rp JOIN rounds r ON r.id = rp.round_id
    WHERE rp.player_id = ${playerId} AND r.status = 'completed'`
  const totalMoney = Number(moneyRows[0]?.total ?? 0)
  const roundsPlayed = Number(moneyRows[0]?.rounds ?? 0)

  const matchRows = await sql`
    SELECT m.team_a, m.team_b, m.presses, m.results
    FROM matches m JOIN rounds r ON r.id = m.round_id
    WHERE r.status = 'completed'`
  let pressesWon = 0
  let pressesLost = 0
  let pressesPlayed = 0
  for (const m of matchRows) {
    const teamA: number[] = m.team_a ?? []
    const teamB: number[] = m.team_b ?? []
    const side = teamA.includes(playerId) ? "A" : teamB.includes(playerId) ? "B" : null
    if (!side) continue
    const results = m.results ?? {}
    const pressResults: Record<string, string | null> = results.pressResults ?? {}
    for (const press of (m.presses ?? []) as any[]) {
      const w = pressResults[press.id]
      if (!w || w === "halved") continue
      pressesPlayed++
      if (w === side) pressesWon++
      else pressesLost++
    }
  }

  return {
    roundsPlayed,
    totalMoney,
    frontAvg: frontHoles > 0 ? frontTotal / (frontHoles / 9) : null,
    backAvg: backHoles > 0 ? backTotal / (backHoles / 9) : null,
    frontVsPar: frontHoles > 0 ? frontTotal - frontParTotal : null,
    backVsPar: backHoles > 0 ? backTotal - backParTotal : null,
    bounceBackOpportunities,
    bounceBacks,
    bounceBackRate: bounceBackOpportunities > 0 ? bounceBacks / bounceBackOpportunities : null,
    fireHotStreaks,
    longestBirdieStreak,
    pressesWon,
    pressesLost,
    pressesPlayed,
  }
}
