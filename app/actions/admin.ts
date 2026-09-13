"use server"

import { sql } from "@/lib/db"
import { getIsAdmin, setAdmin, clearAdmin } from "@/lib/session"
import { recomputeRoundMoney } from "@/app/actions/rounds"
import { revalidatePath } from "next/cache"

export async function adminLogin(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return { ok: false, error: "Admin password is not configured." }
  if (password !== expected) return { ok: false, error: "Incorrect password." }
  await setAdmin()
  revalidatePath("/admin")
  return { ok: true }
}

export async function adminLogout() {
  await clearAdmin()
  revalidatePath("/admin")
}

export async function deletePlayerAdmin(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return { ok: false, error: "Not authorized." }

  const [{ count: roundCount }] = await sql`SELECT count(*)::int AS count FROM round_players WHERE player_id = ${id}`
  const [{ count: createdCount }] = await sql`SELECT count(*)::int AS count FROM rounds WHERE created_by = ${id}`
  if (Number(roundCount) > 0 || Number(createdCount) > 0) {
    return {
      ok: false,
      error: "This player has round history and can't be deleted. Rename them instead.",
    }
  }

  await sql`DELETE FROM players WHERE id = ${id}`
  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/leaderboard")
  return { ok: true }
}

export async function updatePlayerAdmin(
  id: number,
  input: { name: string; lastName?: string | null; handicap?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return { ok: false, error: "Not authorized." }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "A name is required." }
  const lastName = input.lastName?.trim() || null
  const handicap = Number.isFinite(input.handicap) ? Math.round(input.handicap as number) : 0

  await sql`UPDATE players SET name = ${name}, last_name = ${lastName}, handicap = ${handicap} WHERE id = ${id}`
  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/leaderboard")
  revalidatePath(`/player/${id}`)
  return { ok: true }
}

export async function updateMatchBetsAdmin(
  matchId: number,
  nineBet: number,
  overallBet: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return { ok: false, error: "Not authorized." }
  if (!Number.isFinite(nineBet) || !Number.isFinite(overallBet) || nineBet < 0 || overallBet < 0) {
    return { ok: false, error: "Bet amounts must be non-negative numbers." }
  }

  const rows = await sql`SELECT round_id FROM matches WHERE id = ${matchId}`
  if (!rows[0]) return { ok: false, error: "Match not found." }
  const roundId = rows[0].round_id as number

  await sql`UPDATE matches SET nine_bet = ${Math.round(nineBet)}, overall_bet = ${Math.round(overallBet)} WHERE id = ${matchId}`
  await recomputeRoundMoney(roundId)
  revalidatePath(`/round/${roundId}`)
  revalidatePath("/leaderboard")
  return { ok: true }
}
