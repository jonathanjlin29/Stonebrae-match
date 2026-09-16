"use server"

import { sql } from "@/lib/db"
import { COURSE } from "@/lib/course"
import { computeMatchMoney } from "@/lib/nassau"
import { getCurrentPlayerId, getIsAdmin } from "@/lib/session"
import type { Match, Player, Round, RoundPlayer, Scores } from "@/lib/types"
import { revalidatePath } from "next/cache"
import { getPlayers } from "./players"

type MatchConfig = {
  type: "singles" | "team"
  teamA: number[]
  teamB: number[]
  nineBet: number
  overallBet: number
}

export async function createRound(input: {
  playerIds: number[]
  handicaps: Record<number, number>
  matches: MatchConfig[]
}): Promise<{ ok: true; roundId: number } | { ok: false; error: string }> {
  const createdBy = await getCurrentPlayerId()
  if (input.playerIds.length < 2) return { ok: false, error: "Add at least two players." }

  const roundRows = await sql`
    INSERT INTO rounds (course_name, course, status, created_by)
    VALUES (${COURSE.name}, ${JSON.stringify(COURSE.holes)}, 'active', ${createdBy})
    RETURNING id`
  const roundId = roundRows[0].id as number

  for (const pid of input.playerIds) {
    const hcp = Math.round(input.handicaps[pid] ?? 0)
    await sql`INSERT INTO round_players (round_id, player_id, handicap) VALUES (${roundId}, ${pid}, ${hcp})`
  }

  for (const m of input.matches) {
    await sql`
      INSERT INTO matches (round_id, type, team_a, team_b, nine_bet, overall_bet)
      VALUES (${roundId}, ${m.type}, ${JSON.stringify(m.teamA)}, ${JSON.stringify(m.teamB)}, ${m.nineBet}, ${m.overallBet})`
  }

  revalidatePath("/")
  revalidatePath("/leaderboard")
  return { ok: true, roundId }
}

export async function getRound(id: number): Promise<Round | null> {
  const roundRows = await sql`SELECT * FROM rounds WHERE id = ${id}`
  if (!roundRows[0]) return null
  const r = roundRows[0]

  const playerRows = await sql`
    SELECT rp.player_id, rp.handicap, rp.money_won, p.name, p.last_name, p.nickname
    FROM round_players rp JOIN players p ON p.id = rp.player_id
    WHERE rp.round_id = ${id}
    ORDER BY rp.id ASC`

  const profiles = new Map((await getPlayers()).map((player) => [player.id, player]))
  const players: RoundPlayer[] = playerRows.map((row: any) => ({
    id: row.player_id,
    name: row.name,
    lastName: row.last_name,
    nickname: row.nickname ?? null,
    photoUrl: profiles.get(row.player_id)?.photoUrl ?? null,
    handicap: row.handicap,
    roundHandicap: row.handicap,
    moneyWon: Number(row.money_won),
  }))

  const scoreRows = await sql`SELECT player_id, hole, strokes FROM scores WHERE round_id = ${id}`
  const scores: Scores = {}
  for (const p of players) scores[p.id] = Array(18).fill(null)
  for (const row of scoreRows) {
    if (!scores[row.player_id]) scores[row.player_id] = Array(18).fill(null)
    scores[row.player_id][row.hole] = row.strokes
  }

  const matchRows = await sql`SELECT * FROM matches WHERE round_id = ${id} ORDER BY id ASC`
  const matches: Match[] = matchRows.map((row: any) => ({
    id: row.id,
    roundId: row.round_id,
    type: row.type,
    teamA: row.team_a,
    teamB: row.team_b,
    nineBet: Number(row.nine_bet),
    overallBet: Number(row.overall_bet),
    presses: row.presses ?? [],
    results: row.results ?? { front: null, back: null, overall: null, pressResults: {} },
    money: row.money ?? {},
  }))

  return {
    id: r.id,
    courseName: r.course_name,
    holes: r.course,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    players,
    scores,
    matches,
  }
}

export async function saveScore(roundId: number, playerId: number, hole: number, strokes: number | null) {
  if (strokes == null) {
    await sql`DELETE FROM scores WHERE round_id = ${roundId} AND player_id = ${playerId} AND hole = ${hole}`
  } else {
    await sql`
      INSERT INTO scores (round_id, player_id, hole, strokes)
      VALUES (${roundId}, ${playerId}, ${hole}, ${strokes})
      ON CONFLICT (round_id, player_id, hole) DO UPDATE SET strokes = EXCLUDED.strokes`
  }
  await recomputeRoundMoney(roundId)
  revalidatePath(`/round/${roundId}`)
  revalidatePath("/leaderboard")
  return { ok: true }
}

export async function addPress(
  roundId: number,
  matchId: number,
  scope: "front" | "back" | "overall",
  startHole: number,
  initiatedBy: "A" | "B",
  amount: number,
) {
  const rows = await sql`SELECT presses FROM matches WHERE id = ${matchId}`
  const presses = (rows[0]?.presses ?? []) as any[]
  presses.push({
    id: `p${Date.now()}`,
    matchId,
    scope,
    startHole,
    initiatedBy,
    amount: Math.max(0, Math.round(amount)),
  })
  await sql`UPDATE matches SET presses = ${JSON.stringify(presses)} WHERE id = ${matchId}`
  await recomputeRoundMoney(roundId)
  revalidatePath(`/round/${roundId}`)
  return { ok: true }
}

export async function updatePressAmount(roundId: number, matchId: number, pressId: string, amount: number) {
  const rows = await sql`SELECT presses FROM matches WHERE id = ${matchId}`
  const presses = (rows[0]?.presses ?? []) as any[]
  const next = presses.map((p) => (p.id === pressId ? { ...p, amount: Math.max(0, Math.round(amount)) } : p))
  await sql`UPDATE matches SET presses = ${JSON.stringify(next)} WHERE id = ${matchId}`
  await recomputeRoundMoney(roundId)
  revalidatePath(`/round/${roundId}`)
  return { ok: true }
}

export async function recomputeRoundMoney(roundId: number) {
  const round = await getRound(roundId)
  if (!round) return
  const playerList: Player[] = round.players.map((p) => ({
    id: p.id,
    name: p.name,
    lastName: p.lastName,
    nickname: p.nickname,
    handicap: p.roundHandicap,
  }))

  const totals: Record<number, number> = {}
  for (const p of round.players) totals[p.id] = 0

  for (const m of round.matches) {
    const { money, results } = computeMatchMoney(m, round.scores, playerList)
    for (const [pid, amt] of Object.entries(money)) totals[Number(pid)] = (totals[Number(pid)] ?? 0) + amt
    await sql`UPDATE matches SET results = ${JSON.stringify(results)}, money = ${JSON.stringify(money)} WHERE id = ${m.id}`
  }

  for (const [pid, amt] of Object.entries(totals)) {
    await sql`UPDATE round_players SET money_won = ${amt} WHERE round_id = ${roundId} AND player_id = ${Number(pid)}`
  }
}

export async function completeRound(roundId: number) {
  await recomputeRoundMoney(roundId)
  await sql`UPDATE rounds SET status = 'completed', completed_at = now() WHERE id = ${roundId}`
  revalidatePath(`/round/${roundId}`)
  revalidatePath("/")
  revalidatePath("/leaderboard")
  return { ok: true }
}

export async function reopenRound(roundId: number) {
  await sql`UPDATE rounds SET status = 'active', completed_at = NULL WHERE id = ${roundId}`
  revalidatePath(`/round/${roundId}`)
  return { ok: true }
}

export async function deleteRound(roundId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentPlayerId = await getCurrentPlayerId()
  const isAdmin = await getIsAdmin()

  const rows = await sql`SELECT created_by FROM rounds WHERE id = ${roundId}`
  if (!rows[0]) return { ok: false, error: "Round not found." }

  const isCreator = currentPlayerId != null && rows[0].created_by === currentPlayerId
  if (!isAdmin && !isCreator) {
    return { ok: false, error: "Only an admin or the round's creator can delete it." }
  }

  await sql`DELETE FROM matches WHERE round_id = ${roundId}`
  await sql`DELETE FROM scores WHERE round_id = ${roundId}`
  await sql`DELETE FROM round_players WHERE round_id = ${roundId}`
  await sql`DELETE FROM rounds WHERE id = ${roundId}`

  revalidatePath("/")
  revalidatePath("/leaderboard")
  return { ok: true }
}

export async function getActiveRoundForPlayer(playerId: number) {
  const rows = await sql`
    SELECT r.id
    FROM rounds r
    JOIN round_players rp ON rp.round_id = r.id
    WHERE r.status = 'active' AND rp.player_id = ${playerId}
    ORDER BY r.created_at DESC
    LIMIT 1`
  return rows[0]?.id as number | undefined
}

export async function getActiveRounds() {
  const rows = await sql`
    SELECT r.id, r.created_at, r.status,
      (SELECT count(*) FROM round_players rp WHERE rp.round_id = r.id) AS player_count,
      (SELECT string_agg(p.name, ', ') FROM round_players rp JOIN players p ON p.id = rp.player_id WHERE rp.round_id = r.id) AS names
    FROM rounds r
    WHERE r.status = 'active'
    ORDER BY r.created_at DESC`
  return rows.map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    playerCount: Number(r.player_count),
    names: r.names ?? "",
  }))
}

export async function getRecentRounds(limit = 10) {
  const rows = await sql`
    SELECT r.id, r.created_at, r.completed_at, r.status,
      (SELECT string_agg(p.name, ', ') FROM round_players rp JOIN players p ON p.id = rp.player_id WHERE rp.round_id = r.id) AS names
    FROM rounds r
    WHERE r.status = 'completed'
    ORDER BY r.completed_at DESC NULLS LAST
    LIMIT ${limit}`
  return rows.map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    status: r.status,
    names: r.names ?? "",
  }))
}
