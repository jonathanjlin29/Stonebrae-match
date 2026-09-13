"use server"

import { sql } from "@/lib/db"
import { getCurrentPlayerId, setCurrentPlayerId, clearCurrentPlayer } from "@/lib/session"
import type { Player } from "@/lib/types"
import { revalidatePath } from "next/cache"

function mapPlayer(row: any): Player {
  return {
    id: row.id,
    name: row.name,
    lastName: row.last_name,
    handicap: row.handicap,
  }
}

export async function getPlayers(): Promise<Player[]> {
  const rows = await sql`SELECT id, name, last_name, handicap FROM players ORDER BY name ASC, last_name ASC NULLS FIRST`
  return rows.map(mapPlayer)
}

export async function getCurrentPlayer(): Promise<Player | null> {
  const id = await getCurrentPlayerId()
  if (!id) return null
  const rows = await sql`SELECT id, name, last_name, handicap FROM players WHERE id = ${id}`
  return rows[0] ? mapPlayer(rows[0]) : null
}

export async function createPlayer(input: {
  name: string
  lastName?: string
  handicap?: number
}): Promise<{ ok: true; player: Player } | { ok: false; error: string; needsLastName?: boolean }> {
  const name = input.name.trim()
  const lastName = input.lastName?.trim() || null
  const handicap = Number.isFinite(input.handicap) ? Math.round(input.handicap as number) : 0

  if (!name) return { ok: false, error: "A name is required." }

  // Duplicate first-name detection: require a last name to disambiguate.
  const sameName =
    await sql`SELECT id, last_name FROM players WHERE lower(name) = lower(${name})`
  if (sameName.length > 0 && !lastName) {
    return {
      ok: false,
      error: `There's already a "${name}". Add a last name so people can tell you apart.`,
      needsLastName: true,
    }
  }
  if (lastName) {
    const exact =
      await sql`SELECT id FROM players WHERE lower(name) = lower(${name}) AND lower(coalesce(last_name,'')) = lower(${lastName})`
    if (exact.length > 0) {
      return { ok: false, error: "That exact name already exists — select them instead." }
    }
  }

  const rows =
    await sql`INSERT INTO players (name, last_name, handicap) VALUES (${name}, ${lastName}, ${handicap}) RETURNING id, name, last_name, handicap`
  revalidatePath("/")
  return { ok: true, player: mapPlayer(rows[0]) }
}

export async function selectPlayer(id: number) {
  await setCurrentPlayerId(id)
  revalidatePath("/")
}

export async function signUpAndSelect(input: {
  name: string
  lastName?: string
  handicap?: number
}) {
  const res = await createPlayer(input)
  if (res.ok) {
    await setCurrentPlayerId(res.player.id)
    revalidatePath("/")
  }
  return res
}

export async function signOut() {
  await clearCurrentPlayer()
  revalidatePath("/")
}

export async function updateHandicap(id: number, handicap: number) {
  await sql`UPDATE players SET handicap = ${Math.round(handicap)} WHERE id = ${id}`
  revalidatePath("/")
}
